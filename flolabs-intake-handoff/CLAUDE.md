# FloLabs Intake Forms on Twenty CRM: Agent Handoff

Read this file first in every session. Detailed sources of truth:
- `docs/intake-forms-spec.md` (all 13 forms + widget: fields, types, required rules, new program questions, 40 programs, schema changes)
- `docs/twenty-schema.md` (live Twenty API names, option values, Site ID; produced in T1)
- `docs/implementation-plan.md` (tasks T1-T16, acceptance criteria, risks)
- `docs/source/` (original briefs and question templates, ERD screenshots). Use them for the exact text of existing questions.
If this file and the spec disagree, the spec wins. If the spec and `docs/source/` disagree, the spec wins (it records later decisions).

## 1. Your role
Act as a senior engineer mentoring a less experienced developer. Stay strictly in scope: implement only the task in progress. Validate instructions, propose better approaches with reasons, and ask before acting on ambiguity. Prefer surgical edits over rewrites. Be direct and concise.

## 2. What we are building
A self-hosted CRM for FloLabs on **Twenty** (open source), replacing HubSpot for the intern recruitment pipeline:
Application -> (HR email) Contacted [Form 1] + Before Meeting [Form 2] -> Orientation meeting -> Masterclass [Form 3] -> Onboarded.
Plus a Contact Us form and a Newsletter widget for FloLabs websites.

## 3. Stack and environments
- Next.js (App Router) + TypeScript + React. Zod for validation. Vitest for tests. ESLint.
- Twenty CRM: `https://157-230-82-204.sslip.io` (REST/GraphQL API; API key in env only).
- Cloudflare Turnstile (bot protection). Cloudflare R2 (CV storage).
- POC runs locally with `npm run dev`. No hosting deployment yet.
- App lives in this folder (`flolabs-intake-handoff/`, where `.env.local` is). Commands: `npm run dev | build | lint | typecheck | test`; `npm run test:live` = read-only checks against the live Twenty.
- Pinned: Next 16.4.3, React 19.3.1, Zod 4.6.7, TypeScript 6.0.3 (typescript-eslint does not support TS 7 yet), ESLint 9.39.5 (Next's lint plugins cap at 9), Vitest 5.0.5.
- Server code lives in `src/server/` and imports `server-only`. Twenty access only through `src/server/twenty` (GraphQL with variables; REST filters break on `)` and `,`).
- Forms address: dev/test `forms.157-230-82-204.sslip.io`; production `forms.flolabsinnovations.com`.
- Env vars: `TWENTY_BASE_URL`, `TWENTY_API_KEY`, `TURNSTILE_SITE_KEY`, `TURNSTILE_SECRET_KEY`, `LINK_TOKEN_SECRET`, `R2_ACCOUNT_ID`, `R2_ACCESS_KEY_ID`, `R2_SECRET_ACCESS_KEY`, `R2_BUCKET`. All in `.env.local` (git-ignored). Locally, use Cloudflare's Turnstile test keys.

## 4. Non-negotiable rules
1. **Never read, print, log or echo `.env*` files or secret values.** Never ask the user to paste a secret into chat.
2. The browser never calls Twenty or R2 directly. Only server Route Handlers do.
3. The Twenty client exposes **named operations only** (for example findPersonByEmail, createApplication). No generic proxy, and no direct PostgreSQL access.
4. **One Zod schema per form**, shared by the client (live inline errors and success messages) and the server.
5. On every public POST, the server verifies Turnstile and the rate limit (per IP + per email) **before** any Twenty or R2 call.
6. Idempotency: Twenty generates each record's `id` (the Submission ID). Every submission also carries a client UUID `submissionKey`, stored on the created record; a duplicate key returns the original result.
7. Logs: structured JSON with record IDs and error codes only. **No names, emails, phones, answers or file contents.** Users get generic error messages.
8. Use Twenty **API names and option values** from `docs/twenty-schema.md` (produced in T1), never UI labels. Each option in the config is `{value, label}`.
9. Do not create or change Twenty schema objects without the user's explicit approval.
10. Gate: **no application code is written before T1 is done.**

## 5. Forms and links (13 forms + 1 widget)
| Form | Delivery | Versions |
|---|---|---|
| Application | iframe embed in a section of any FloLabs website, and hosted link `/apply?site=<site_id>` | 1 |
| Contact Us | iframe embed in a section of any FloLabs website | 1 |
| Newsletter (widget, email only) | iframe embed in a section of any FloLabs website | 1 |
| Form 1 Contacted | hosted link `/contacted?t=<token>` | 5 track versions, merged when positions span tracks |
| Form 2 Before Meeting | hosted link `/before-meeting?t=<token>` | 5 track versions, merged likewise |
| Form 3 Masterclass | hosted link `/masterclass?t=<token>` | 1 |

**Embeds (Application, Contact Us, Newsletter; decided 2026-10-24).** One loader `embed.js` + one `/embed/[form]` route. A website places a `<div>` where the form should appear:
`<div data-flolabs-form="application" data-site="robocollective"></div><script src="https://forms.<domain>/embed.js" async></script>` (`contact-us`, `newsletter` likewise)
- The loader turns the div into an auto-resizing iframe (a section of the page, not a whole page).
- CSP `frame-ancestors https:`: **any HTTPS website** may embed the forms, so current and future FloLabs websites work without a code change. All other pages (e.g. `/apply`) cannot be framed.
- `data-site` is never refused: every submission records and marks it with the site rule below.

**Site rule (all forms, approved 2026-10-24, `src/server/sites.ts`).** The site key (`data-site` or `?site=`) is resolved server-side: active -> Site linked, `siteStatus` KNOWN; missing -> Site empty, MISSING; unknown (e.g. a future website not yet in Twenty) -> Site empty, UNKNOWN; inactive -> that Site linked, INACTIVE. The key as received is kept in `siteKeyReceived` (Application, Inquiry) or `communicationConsentSite` (Newsletter, on Person). The visitor never chooses the Site.

**Application link.** `/apply?site=<site_id>`, public, no token, same site rule.

**Sites.** All 16 FloLabs Sites exist in Twenty (`scripts/t2-sites.mjs`, ids in `docs/twenty-schema.md`). `flomad` is inactive (expired certificate, site down).

**Tokens.** Stateless HMAC-signed token `{applicationId, formType}`:
- **No expiry** (unlimited validity), but single use (rejected if a Form Submission already exists for it).
- HR sends the links manually until SES is available.

**Form 1 and 2 rendering.** Config-driven. One engine builds the sections from the applicant's positions:
- Form 1 = general questions + track-wide questions + **only the applicant's program questions** + closing.
- Form 2 = "reviewed overview?" (Yes/No) + track questions for the applicant's programs + closing.
- Cross-track applicants get one merged form: shared parts once, one section per track.

**Form 1 pre-fill.** Full name, Email and Program are pre-filled and **read-only**. Instead of asking for the track, show: "The program you applied for, <Program>, is under the <Track> track." (one line per program).

## 6. Data model (Twenty)
Terminology: internship roles are **programs**; each program belongs to one **track** (formerly "school").
Existing: **People** (native), **Applications** (custom; belongs to one Person and one Site), **Sites** (custom; has many Applications). Applications also has an Attachments relation. Exact API names: `docs/twenty-schema.md`.

**Person mapping:**
- name (first, last), emails, phones, location (ADDRESS: country, state, city), linkedinLink, education.
- Rule for an existing Person matched by email: **only fill empty fields; never overwrite.**

**Application:**
- `positionAppliedFor` (MULTI_SELECT, label "Programs Applied For", 40 programs: 39 live + Backend Developer Intern)
- `source` (**SELECT, one answer**, 26 values); Source Detail (required when Other); Referral Name (required when Referral)
- Safe Sender Confirmed; Submitted At; Source Form ID; Form Version; Lifecycle Stage / Lead Status (POC test values only); `submissionKey` (new)
- CV in `cvResume` (FILES)
- Consents stay separate on Application and are used: marketing `communicationConsent`(+At), SMS/phone `phoneMessagingConsent`(+At), `consentVersion`. The form has two optional opt-in checkboxes (marketing, SMS/phone), unchecked by default. **No Subscription object.**
- Newsletter (revised POC): find-or-create Person by email; consent goes to Person-level consent fields (spec D17). A later application by that email fills only empty Person fields.
- **Exactly one Application per submission**, holding all selected programs.

**New objects (approved at Checkpoint A, spec section 7; created in T2 once the key has Data Model permission):**
- **Inquiry** (Contact Us): subject, message, status, submittedAt, submissionKey, Person, Site.
- **Form Submission:** formType, tracks, formVersion, submittedAt, submissionKey, answers (RAW_JSON keyed by question ID), answersSummary (RICH_TEXT markdown generated from answers, for HR/marketing), typed filter fields (hoursPerWeek, commitmentDuration, remoteOk, canAttendMeetings, stillInterested, continueToInterview, canMeetCommitment, referencesContactAllowed), Application.
- **Reference:** fullName, title, organization, relationship, email, phone, knownDuration, Application.

**CV:**
- PDF/DOCX only, verified by file signature, max 5 MB.
- **Path A (in use since T6c, verified live 2026-10-24):** upload into `Application.cvResume` via `createFileUpload` / `completeFileUpload`, with Twenty's storage on R2 (`STORAGE_TYPE=S_3`, `STORAGE_S3_ENDPOINT`; server change done by the team lead, T6c-0).
- **Path B (fallback, if the API cannot upload attachments):** private R2 key on the Application, plus a "View CV" overlay behind Cloudflare Access with a short-lived presigned URL. DOCX is converted to PDF at upload.
- If the CV upload fails, no Application is created.

## 7. Key field decisions
- Application required: first and last name, email, phone, country, city, education/major, positions, CV, source, safe-sender checkbox. Optional: state, LinkedIn.
- Form 1: G8 hours per week = integer 1-40. G9 duration = Under 3 months / 3-6 months / 6-12 months / Over 12 months.
- Form 2: closing has 4 options. "Yes, but I have questions" reveals a required text box.
- Form 3: M2 Yes/No; M3 Yes / No / I need to discuss my availability; M4 optional. 2 references; "How long have they known or worked with you?" (required) = 0-6 months / 6-12 months / 1-2 years / 2-3 years. Contact permission No -> explanation required.
- Technical Writing Q3 shows a fixed snippet to rewrite (text in the spec).
- Program labels: the live Twenty labels are kept as they are. New programs: Title Case, "Intern" suffix. The canonical 40 programs and the track mapping are in spec section 9.

## 8. Immediate next steps
POC scope: **the Application form first.** Forms 1-3, Contact Us and Newsletter come in a revised POC.
1. T1 schema verification: **done** (`docs/twenty-schema.md`). Checkpoint A decisions: **approved** (2026-10-24).
2. T2a Application schema changes: **done** (2026-10-24). T2b (new objects, Person consent fields) waits for the revised POC.
3. T3 scaffold + typed Twenty client: **done** (2026-10-24, branch `t3-scaffold-twenty-client`).
4. T4 shared config + Zod schema: **done** (2026-10-24). Consent checkbox wording approved (`src/shared/config/application.ts`).
5. T5 `POST /api/applications` and T6 `/apply` form: **done** (2026-10-24). Twenty formats confirmed by a test write: `addressCountry` = English country name; phone = national number + ISO country code + calling code.
6. T6c CV upload (path A): **done** (2026-10-24). T6c-0 (Twenty storage on R2) is still for the team lead; the app needs no change for it. T6d is not needed.
7. T7 Turnstile + rate limits: **done** (2026-10-24). Local testing uses `npm run dev` (Turnstile test keys); `next start` needs real keys in `.env.local`.
8. T2b (Inquiry + Person consent fields), T6b embeds, T8 Newsletter: **done** (2026-10-24). T9 Contact Us: code done; live run waits for the admin to give the API key's role access to the Inquiry object.
9. Test page for embeds: `npm run dev`, then `http://localhost:3000/dev/embed-test`.
10. T2b complete (Form Submission, Reference), T10 signed links and T11 form engine: **done** (2026-10-24). Waiting for the admin: the API key's role must be allowed to read/create Inquiries, Form Submissions and References.
11. Next: T12 Form 1 (5 track configs with the real questions) on the T11 engine.

Recommended skills per step: source-driven-development (T1), api-and-interface-design (T5), security-and-hardening (T5, T7, T15), incremental-implementation, frontend-ui-engineering (T6), test-driven-development, flolabs-code-reviewer before merge, documentation-and-adrs (T16).

## 9. Out of scope for now
Amazon SES, marketing campaigns, pipeline automation and status taxonomy, BigQuery, Telnyx/SMS, AI features, CRM data migration, production deployment, the n8n/HubSpot cut-over.
