# Implementation Plan: FloLabs Intake Forms on Twenty (v1)

## Overview
One Next.js + TypeScript app, colocated with the CRM host, serves 13 forms + 1 widget: 4 hosted links (Application, public; Form 1, 2, 3, each with a per-applicant token) and 2 embeds (Contact Us, Newsletter) delivered by one loader script that injects an iframe. It writes only through a server-side, purpose-built Twenty client. Spec: `Intake Forms Spec v1.md`.

## Architecture decisions
- Config-driven forms: one renderer each for Form 1 and Form 2; a track config holds question IDs, program-to-question mapping and the merge rules. Questions are versioned (`formVersion`).
- One Zod schema per form, shared by client and server. Turnstile verified on the server on every public POST.
- Server-only Twenty client exposing named operations only (findPersonByEmail, createApplication, ...). No generic proxy.
- Stateless HMAC-signed link tokens {applicationId, formType}, no expiry. Single use is enforced by an existing Form Submission. Secret lives in env.
- Twenty generates every record `id` (the Submission ID). Idempotency via a client `submissionKey` stored on every record created.
- Answers stored as RAW_JSON keyed by question ID, plus a generated markdown summary (RICH_TEXT) for HR/marketing; filterable fields typed.
- Embeds (Contact Us, Newsletter): one `embed.js` loader + one `/embed/[form]` route; `frame-ancestors` allow-list of FloLabs domains; Site resolved server-side from an allow-listed site key.
- Application: hosted page `/apply?site=<site_id>`; Site resolved server-side from the allow-listed key.
- CVs in a private Cloudflare R2 bucket. Path A: through Twenty's own file storage (on R2) into `Application.cvResume`. Path B: Twenty keeps only the object key. No public URLs.
- Logging: structured JSON with record IDs only (no names, emails, phones, answers). Users see generic errors.

## Scope
POC = the Application form (Phase 0 + Phase 1, with T2a only). Forms 1-3, Contact Us and Newsletter (T2b, Phases 2-3) follow in a revised POC.

## Dependency graph
Schema verification (T1) -> Application schema changes (T2a) -> Twenty client + scaffold (T3)
  -> Application slice (T4-T7) = POC
  -> [revised POC] New objects (T2b) -> [Newsletter T8, Contact Us T9] (parallel)
  -> Tokens (T10) -> Form engine (T11) -> Form 1 (T12) -> Form 2 (T13) -> Form 3 (T14)
  -> Hardening (T15) -> Docs (T16)

## Phase 0: Foundation

**T1 Verify the Twenty schema (needs the API key).** S. **Done 2026-10-23** (`docs/twenty-schema.md`; path A supported).
- AC: exact API names for People / Applications / Sites fields, relation fields, and the multi-select value format recorded in `docs/twenty-schema.md`; Site ID for flolabs_international recorded.
- Verify: one read-only GET per object succeeds from a local script; key only in `.env.local`.
- Gate (risk mitigation): no application code is written until this map exists; every later task uses names from it, never UI labels.
- AC: confirm whether the instance's API (Settings -> Developers -> API docs) can upload a file as an Attachment on an Application. Result decides CV path A or B (T6c).
- Skill: source-driven-development.

**T2a Application schema changes (POC).** S. **Done 2026-10-24** (`scripts/t2a-apply.mjs`; snapshot `docs/snapshots/twenty-schema-2026-10-24-t2a.json`).
- AC: `positionAppliedFor` = 40 values (adds `BACKEND_DEVELOPER_INTERN`; the 39 live options untouched); `source` stays SELECT with 26 values (8 added, labels cleaned, values unchanged); `positionAppliedFor` label = "Programs Applied For"; `submissionKey` TEXT added.
- Verify: re-run `scripts/t1-schema-probe.mjs`, diff against `docs/snapshots/twenty-schema-2026-10-23.json`; only the changes above; nothing deleted or renamed.
- Depends: T1.

**T2b New objects (revised POC).** M
- AC: Inquiry, Form Submission (incl. `submissionKey`, `answers` RAW_JSON, `answersSummary` RICH_TEXT) and Reference exist as in spec section 7; Person consent fields added (D17). No Subscription object.
- Verify: same snapshot diff.
- Depends: T2a.

**T3 Scaffold + typed Twenty client.** M. **Done 2026-10-24**: env fail-fast via `src/instrumentation.ts`; client in `src/server/twenty` (GraphQL, named operations: findSiteByKey, findPersonByEmail, createPerson, updatePerson, findApplicationBySubmissionKey, createApplication); IDs-only logger; error mapper; 19 unit tests + 4 live read-only tests (`npm run test:live`). CV upload operations are added in T6c.
- AC: `npm run dev` works; env validated at boot (fails fast if missing); client exposes only named operations; ESLint + Vitest set up.
- AC (risk mitigation): logger helper that only accepts IDs/codes; a central error mapper returns generic messages; test asserts no email/phone appears in log output.
- Verify: unit tests with a mocked fetch; `.env.local` git-ignored.
- Depends: T1.

Checkpoint A: tests and build pass; you review the schema map. (Schema decisions approved 2026-10-24.)

## Phase 1: Application slice (= briefing POC)

**T4 Shared config + Zod schema (programs, tracks, sources).** S
- AC: one program-to-track map (40 programs) used everywhere; conditional rules (Other -> detail, Referral -> name) enforced.
- AC (risk mitigation): each option has `{value, label}`; the UI shows labels, the server only ever sends API values to Twenty; a test fails if any config value is missing from the live Twenty options.
- Verify: unit tests for each rule and for normalization (email, phone E.164).

**T5 POST /api/applications.** M
- AC: find-or-create Person (fill-empty only); exactly one Application with all programs + Site; marketing and SMS/phone consents written to their own Application fields with timestamps + consentVersion; duplicate submissionKey returns the original result; generic errors only.
- Verify: tests against mocked Twenty; one real run checked in the Twenty UI.
- Depends: T2a, T3, T4.

**T6 Application form UI (hosted page `/apply`).** M
- AC: live inline errors/success; conditional fields; accessible labels/keyboard; `?site=` resolved to an active Site server-side.
- Verify: manual run through all 3 Source branches; browser devtools show no Twenty key or URL.
- Skill: frontend-ui-engineering.

**T6b Embed loader + embed route (moved to the revised POC, with T8/T9).** S
- AC: `<script src=".../embed.js" data-form="contact-us" data-site="robocollective">` injects an auto-resizing iframe; CSP `frame-ancestors` lists only FloLabs domains; unknown site keys are rejected.
- Verify: embedding works on an allow-listed test page and is refused on a non-listed origin.

**T6c-0 Point Twenty's file storage at R2 (server config, path A only).** S
- AC: Twenty server + worker use `STORAGE_TYPE=S_3`, `STORAGE_S3_ENDPOINT=https://<account>.r2.cloudflarestorage.com`, bucket and R2 keys; existing local files copied to the bucket first.
- Verify: upload an attachment in the Twenty UI, see it in R2, open it again from Twenty. Needs server access + a Twenty backup before the change.

**T6c CV upload.** M
- Common AC: PDF/DOCX only (checked by file signature, not just extension), max 5 MB; upload failure means no Application is created.
- Path A (preferred): CV uploaded with `createFileUpload` (fileFolder `FilesField`, the `cvResume` field id) -> PUT -> `completeFileUpload`, then saved in `Application.cvResume`; HR opens it on the Application record.
- Path B (fallback): CV stored in a private R2 bucket under a random key; key saved on the Application; T6d provides the viewer.
- Verify: tests for wrong type, oversize and renamed .exe; file visible in R2; no public URL.

**T6d CV viewer overlay (path B only).** M
- AC: "View CV" link on the Application opens an overlay; access requires a logged-in FloLabs user (Cloudflare Access); the file is served through a short-lived presigned URL; DOCX is converted to PDF at upload so every CV displays in the overlay.
- Verify: logged-out request is refused; link expires after 15 minutes.

**T7 Turnstile + rate limits.** S
- AC: server rejects missing/invalid Turnstile tokens before any Twenty or R2 call; rate limit per IP and per email; idempotency via submissionKey (T5).
- Verify: test with Cloudflare's always-fail key; a burst of requests gets HTTP 429.

Checkpoint B: run the briefing's POC acceptance test end to end (including CV in R2, opened from the `/apply` link). Your sign-off.

## Phase 2: Simple embeds (parallel, revised POC)

**T8 Newsletter widget.** S
- AC: find-or-create Person by email (fill-empty); marketing consent, timestamp, consentVersion and site key stored in the Person consent fields; re-subscribing is idempotent. Confirmation email waits for SES.

**T9 Contact Us -> Inquiry.** S
- AC: Person (fill-empty) + Inquiry with Site; message length limits enforced.

Checkpoint C.

## Phase 3: Token-gated forms (revised POC)

**T10 Signed link tokens.** S
- AC: CLI/script generates a link per Application + formType; no expiry; tampered or reused tokens get a friendly error page.
- Verify: unit tests for tamper/reuse.

**T11 Form engine: config, merge and pre-fill logic.** M
- AC: for any set of positions, returns ordered sections (general, track sections with only the applicant's programs, closing) and the track statements.
- Verify: table-driven tests, including a cross-track applicant.

**T12 Form 1 (5 track configs) -> Form Submission.** M
**T13 Form 2 (5 track configs) -> Form Submission.** S (reuses the engine)
**T14 Form 3 + 2 Reference records.** M
- AC (each): read-only pre-fill; required/conditional rules; one Form Submission per token; typed filter fields populated; `answersSummary` markdown generated from `answers` (question text + answer, one heading per section).

Checkpoint D: one applicant (cross-track) goes Application -> Form 1 -> Form 2 -> Form 3; all records linked in Twenty.

## Phase 4: Hardening and docs

**T15 Security pass.** M
- Review all five risk mitigations end to end; CORS locked; security headers; dependency audit; R2 bucket policy check.
- Skill: security-and-hardening, then flolabs-code-reviewer.

**T16 Documentation.** S
- Setup, env vars, the Twenty calls used, assumptions, limitations; ADRs for RAW_JSON answers and stateless tokens.
- Skill: documentation-and-adrs.

## Deferred (not in this plan)
Pipeline automation (status changes, emails to applicants), Lifecycle/Lead Status taxonomy, production deployment, the n8n/HubSpot cut-over.

## Risks
| Risk | Impact | Mitigation |
|---|---|---|
| Twenty API names/format differ from the UI labels | High | T1 before any code (gate in T1) |
| Multi-select stores API values, not labels | Med | Map value<->label in the config; never send labels (T4) |
| Embeds blocked or framing abused | Med | frame-ancestors allow-list; one embed route (T6b) |
| Spam through public forms | Med | Turnstile + rate limits + idempotency (T5, T7) |
| PII exposure in logs/errors | High | Structured logs with IDs only; generic errors (T3) |
| Malicious or oversized CV uploads | Med | Type check by file signature, 5 MB cap, private bucket (T6c) |
| Non-expiring link forwarded or leaked before use | Low | Single use; token bound to one Application + formType; rotating `LINK_TOKEN_SECRET` revokes all unused links (T10) |

## Resolved
- Email: HR sends the tokenized links manually until SES is available.
- Token lifetime: no expiry (changed from 21 days on 2026-10-24); single use.
- Checkpoint A (2026-10-24): source = single SELECT, 26 options; program values and live labels kept, Backend Developer Intern added; source labels cleaned with values kept; Inquiry, Form Submission, Reference approved; no Subscription object (consents stay on Application); Form Submission gets `answersSummary`; reference known duration = 0-6 months / 6-12 months / 1-2 years / 2-3 years; "roles" -> programs, "schools" -> tracks; POC = Application form first.
- Embeds (iframe via loader script): Contact Us, Newsletter. Hosted links: Application (public), Form 1, 2, 3 (tokened). (Corrected 2026-10-24.)
- Sites: all 16 created in Twenty on 2026-10-24 (`scripts/t2-sites.mjs`); `flomad` inactive.
- CV: PDF/DOCX in Cloudflare R2; Twenty attachment preferred, overlay viewer as fallback.
- Technical Writing Q3 snippet approved. G8 = number 1-40; G9 = 4 duration choices.
- Application required/optional fields approved.
- Addresses: dev/test forms.157-230-82-204.sslip.io; production forms.flolabsinnovations.com.

- Form 2 follow-up text box: yes. Form 3 M4: optional. Podcast program rename: superseded, live label "Podcast Production Intern Position" kept.
- Twenty storage change (T6c-0): done by the team lead; step-by-step instructions to be provided when T6c-0 starts.
- Proposed (awaiting confirmation): development happens locally in VS Code with the Claude Code extension; `.env.local` blocked from Claude by permission deny rules.

- 2026-10-24: Person consent field names approved. `submissionKey` field approved. Application form gets an optional SMS/phone opt-in (-> `phoneMessagingConsent`). Newsletter consent goes to Person-level consent fields; a later application by the same email fills only empty Person fields. "Position Applied For" relabelled "Programs Applied For" (T2a).

## Open questions
None.
