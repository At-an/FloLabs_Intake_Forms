# Production launch: FloLabs intake forms

For the person who deploys and runs the forms app (team lead / DevOps). Written 2026-10-24, after T15 (security pass). Follow the steps in order; each ends with a check.

**What goes live:** one Next.js app (`flolabs-intake-handoff/`) at `https://forms.flolabsinnovations.com`, serving:
- embeds for the FloLabs websites (Application, Contact Us, Newsletter) through `/embed.js`;
- the public link `/apply?site=<site_id>`;
- the personal Form 1-3 links (`/contacted`, `/before-meeting`, `/masterclass`), created by HR.

It talks only to Twenty (on the same droplet, at `http://127.0.0.1:3000`; the app itself runs on `127.0.0.1:3001`) and Cloudflare Turnstile. CVs go into Twenty, whose file storage is on Cloudflare R2.

**Rate limits** (set by FloLabs, in `src/server/rate-limit.ts`): **50 requests per IP address per 10 minutes**, and **5 submissions per email address** (per Application for Forms 1-3) **per 30 minutes**. Visitors over a limit see "Too many attempts. Please wait a moment and try again."

**Out of scope for this launch** (decided): Amazon SES (HR sends links by hand), pipeline automation and form order, double opt-in for the Newsletter, other deployments than the one below.

---

## 0. Decisions to confirm before starting

| Decision | Recommendation | Why |
|---|---|---|
| Where the app runs | On the same DigitalOcean droplet as Twenty (157.230.82.204), next to it, behind the droplet's reverse proxy | No new server; the app is light. Any Linux VM with Node 24 works the same way. |
| How many app instances | **Exactly one** | Rate limits and the "one send per link at a time" queue live in memory. Two instances would double the limits and weaken the queue. Moving them to Redis is the upgrade path if you ever need more. |
| DNS / TLS | `forms.flolabsinnovations.com` proxied through **Cloudflare** (orange cloud), TLS "Full (strict)" | Free TLS, DDoS protection, and the real visitor IP in `cf-connecting-ip`. |
| Release unit | A git tag on `main` per release (`v1.0.0`, `v1.0.1`, ...) | Easy rollback: redeploy the previous tag. |

If Cloudflare is not used, see the nginx/Caddy variant in step 6.

---

## 1. The GitHub repository

The code is in the **public** repository **https://github.com/at-an/FloLabs_Intake_Forms** (owner: `at-an`). The app lives in its `flolabs-intake-handoff/` folder.

**Branches:**

| Branch | Purpose |
|---|---|
| `develop` | Day-to-day work. Feature branches are merged here through pull requests. |
| `main` | What runs in production. Updated only by a pull request from `develop`, then tagged (`v1.0.0`, ...). |

1. In the repository settings → **Branches**, protect `main` and `develop`: pull request required, CI (step 2) must pass, no force pushes.
2. Settings → **Code security**: keep **Secret scanning** and **Push protection** on (on by default for public repositories). They block a push that contains an API key.
3. Add the team lead as a collaborator (Settings → Collaborators). If the repository later moves to a FloLabs organisation, use Settings → Transfer; GitHub redirects the old address.

Because the repository is public, **anything committed is public forever**. Secrets only ever go in `.env.local` (development) or `/opt/flolabs-forms/.env.production` (server); both are ignored by git.

**Check:** `git ls-files | grep env` shows only `flolabs-intake-handoff/.env.example`. The T15 scan found no secrets in the history.

## 2. Continuous integration (every pull request, every push to `develop` or `main`, every release tag)

Add `.github/workflows/ci.yml` at the repository root:

```yaml
name: CI
on:
  pull_request:
  push:
    branches: [develop, main]
    tags: ['v*']
permissions:
  contents: read
jobs:
  check:
    runs-on: ubuntu-latest
    defaults:
      run:
        working-directory: flolabs-intake-handoff
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: 24
          cache: npm
          cache-dependency-path: flolabs-intake-handoff/package-lock.json
      - run: npm ci
      - run: npm audit --audit-level=high
      - run: npm run lint
      - run: npm run typecheck
      - run: npm test
      - run: npm run build
```

- No secrets are needed: the build does not read them, and the live tests skip themselves without them.
- **Never** run `npm run test:live-write` in CI: it creates records in Twenty.

**Check:** open a test pull request; all steps are green.

## 3. Twenty: production settings (team lead, in Twenty)

1. **File storage on R2 (T6c-0):** confirm `STORAGE_TYPE=S_3` and the R2 endpoint are set, and the R2 bucket is **private** (no public access, no public bucket URL). CVs are then only reachable through Twenty with a signed link (verified in T6c: an unsigned URL returns 403).
2. **A dedicated API key for production**, named **"Application Form Integration"** (this name appears as "Created by" on every record the forms create).
3. **Least privilege for that key's role.** It needs exactly:

   | Object | Read | Create | Update | Delete |
   |---|---|---|---|---|
   | People | ✓ | ✓ | ✓ (fills empty fields only) | ✗ |
   | Applications | ✓ | ✓ | ✗ | ✗ |
   | Sites | ✓ | ✗ | ✗ | ✗ |
   | Inquiries, Form Submissions, References | ✓ | ✓ | ✗ | ✗ |


   Plus permission to **upload files** (the CV goes into the Application's CV field), under whatever name the Twenty role settings use for it.

   **Remove the Data Model permission** from this role. It was only needed to create the schema during development; the running app never changes the schema.
4. **Sites:** every website that will embed the forms has an **active** Site record with its `siteId` (for example `robocollective`). Submissions with a missing, unknown or inactive site are **refused** before anything is written to Twenty. The 16 Site records already match the canonical list in `src/shared/config/sites.ts`; Flomad stays inactive until its website is back.

**Check:** with the new key in a local `.env.local`, `npm run test:live` passes (read-only).

## 4. Cloudflare Turnstile (bot protection)

1. Cloudflare dashboard → Turnstile → **Add widget**: name "FloLabs forms", mode **Managed**, hostname **`forms.flolabsinnovations.com`** only. Because every form (embedded or not) runs on that hostname, no other hostname is needed, and keys cannot be reused on other sites.
2. Keep the **site key** and the **secret key** for step 5.

## 5. Secrets and settings (on the server, never in git)

Create `/opt/flolabs-forms/.env.production` (owner: the service user, mode `600`):

| Variable | Value |
|---|---|
| `TWENTY_BASE_URL` | `http://127.0.0.1:3000` (Twenty on the same droplet). Plain `http` is accepted only for `127.0.0.1` or `localhost`; any other address must be `https`. |
| `TWENTY_API_KEY` | the production key from step 3 |
| `TURNSTILE_SITE_KEY` / `TURNSTILE_SECRET_KEY` | from step 4 |
| `LINK_TOKEN_SECRET` | 48 random bytes: `node -e "console.log(require('crypto').randomBytes(48).toString('base64url'))"` |
| `TRUSTED_IP_HEADER` | `cf-connecting-ip` behind Cloudflare; `x-real-ip` behind nginx/Caddy without Cloudflare |

The app **refuses to start** in production if the Turnstile keys, `LINK_TOKEN_SECRET` or `TRUSTED_IP_HEADER` are missing.

- **Do not reuse** the development `LINK_TOKEN_SECRET`. Changing it later cancels every Form 1-3 link not used yet; plan rotations accordingly.
- Store a copy of every secret in the FloLabs password manager.

## 6. Install and run the app (first deployment)

On the server (Ubuntu), as root once:

```bash
# Node 24 and a service user
curl -fsSL https://deb.nodesource.com/setup_24.x | bash - && apt-get install -y nodejs
useradd --system --home /opt/flolabs-forms --shell /usr/sbin/nologin flolabs-forms

# Code at a release tag (public repository: no key needed to read it)
git clone --branch v1.0.0 https://github.com/at-an/FloLabs_Intake_Forms.git /opt/flolabs-forms/repo
cd /opt/flolabs-forms/repo/flolabs-intake-handoff
npm ci && npm run build
chown -R flolabs-forms: /opt/flolabs-forms
```

`/etc/systemd/system/flolabs-forms.service`:

```ini
[Unit]
Description=FloLabs intake forms
After=network.target

[Service]
User=flolabs-forms
WorkingDirectory=/opt/flolabs-forms/repo/flolabs-intake-handoff
EnvironmentFile=/opt/flolabs-forms/.env.production
Environment=NODE_ENV=production
ExecStart=/usr/bin/node node_modules/next/dist/bin/next start -p 3001 -H 127.0.0.1
Restart=on-failure
NoNewPrivileges=true
ProtectSystem=strict
ReadWritePaths=/opt/flolabs-forms/repo/flolabs-intake-handoff/.next

[Install]
WantedBy=multi-user.target
```

```bash
systemctl daemon-reload && systemctl enable --now flolabs-forms
journalctl -u flolabs-forms -f      # structured JSON logs (record IDs and codes only)
```

The app listens on `127.0.0.1:3001` only (Twenty keeps port **3000**); the reverse proxy is the only way in.

**Check before routing it:** `curl -I http://127.0.0.1:3001/apply` on the server returns 200.

**Reverse proxy** (only with the project lead's approval). Add a site for `forms.flolabsinnovations.com` to the proxy already in front of Twenty, forwarding to `127.0.0.1:3001`:

- **Caddy:**
  ```
  forms.flolabsinnovations.com {
    reverse_proxy 127.0.0.1:3001 {
      header_up X-Real-IP {remote_host}
    }
  }
  ```
- **nginx:** `proxy_pass http://127.0.0.1:3001; proxy_set_header X-Real-IP $remote_addr; proxy_set_header Host $host;` plus `client_max_body_size 6m;` (the CV limit is 5 MB).

**Behind Cloudflare** (recommended): set `TRUSTED_IP_HEADER=cf-connecting-ip`, and allow HTTP(S) to the server **only from Cloudflare's IP ranges** (cloudflare.com/ips) in the firewall. Otherwise anyone could reach the server directly and fake the header to dodge the rate limits.

**Check:** `systemctl status flolabs-forms` is active; `curl -I https://forms.flolabsinnovations.com/apply` returns 200.

## 7. Smoke test after every deployment (10 minutes)

1. **Headers:** `curl -I https://forms.flolabsinnovations.com/apply` shows `Content-Security-Policy`, `Strict-Transport-Security`, `X-Frame-Options: DENY`; `curl -I .../embed/contact-us` shows `frame-ancestors` followed by the 16 `https://www.` FloLabs addresses and nothing else (no bare `https:`). Before the proxy is in place, run the same `curl -I` checks on the server against `http://127.0.0.1:3001`.
2. **Dev pages hidden:** `/dev/embed-test` and `/dev/link-form` return **404**.
3. **Embed on one real website** (step 8) and check the form appears and resizes.
4. **One real end-to-end run** with a FloLabs staff email:
   - submit the Application form with a small PDF; the Person, Application and CV appear in Twenty. **First run with `TWENTY_BASE_URL=http://127.0.0.1:3000`: open the CV in Twenty to confirm the upload worked** (the app sends the file only to Twenty's own address or to R2; anything else is refused with `UNEXPECTED_UPLOAD_HOST` in the logs);
   - open `/apply?site=nope` and send it: the form is **refused** ("This form cannot be sent from this page") and nothing appears in Twenty;
   - on the server, create a Form 1 link: `cd /opt/flolabs-forms/repo/flolabs-intake-handoff && sudo -u flolabs-forms node --env-file=/opt/flolabs-forms/.env.production --conditions=react-server scripts/make-form-link.mts <applicationId> contacted https://forms.flolabsinnovations.com`;
   - open it, send Form 1; the Form Submission appears in Twenty; reopening the link shows "already sent".
5. **Logs:** `journalctl -u flolabs-forms --since "15 min ago"` shows `application.created` / `form_submission.contacted.created` and **no** names, emails or answers.

If any check fails: roll back (step 9).

## 8. Embed the forms on the websites

On each FloLabs website, where the form should appear (the Site's `siteId` goes in `data-site`):

```html
<div data-flolabs-form="application" data-site="robocollective"></div>
<script src="https://forms.flolabsinnovations.com/embed.js" async></script>
```

Use `data-flolabs-form="contact-us"` or `"newsletter"` for the other two. The script tag is needed once per page. The Application form can also be shared as a plain link: `https://forms.flolabsinnovations.com/apply?site=<siteId>`. **Always include `?site=`**: without it, or with an unknown or inactive site, the submission is refused.

Only the 16 `https://www.` addresses in `src/shared/config/sites.ts` may show the embedded forms. A page at a bare address (for example `https://flolabsinnovations.com` without `www`) shows an empty box instead of the form, unless that website redirects to `www`. Check each website; adding a bare address needs the project lead's approval and a release.

## 9. Releasing updates and rolling back

**Release:**
1. Open a pull request **`develop` → `main`**; merge it when CI is green.
2. Tag the merge commit on `main`: `git checkout main && git pull && git tag vX.Y.Z && git push origin vX.Y.Z` (or create the release in GitHub → Releases, which makes the tag).
3. On the server:

```bash
cd /opt/flolabs-forms/repo && sudo -u flolabs-forms git fetch --tags && sudo -u flolabs-forms git checkout vX.Y.Z
cd flolabs-intake-handoff && sudo -u flolabs-forms npm ci && sudo -u flolabs-forms npm run build
systemctl restart flolabs-forms      # then run the smoke test (step 7)
```

**Rollback:** the same commands with the previous tag. A restart clears the in-memory rate limits; nothing else is lost (all data lives in Twenty, drafts live in applicants' browsers).

**Later automation (optional):** a GitHub Actions job on `v*` tags that runs the release commands over SSH (an SSH key stored as the `DEPLOY_SSH_KEY` repository secret, never in the code). Worth adding once releases are frequent.

## 10. Operating it

| Task | How often | How |
|---|---|---|
| Dependency audit | Monthly and before each release | `npm audit` (CI fails on high/critical); upgrade one dependency at a time, run the tests. |
| Uptime | Continuous | An uptime check (Cloudflare, UptimeRobot, ...) on `https://forms.flolabsinnovations.com/apply`. |
| Logs | When something looks wrong | `journalctl -u flolabs-forms`; every line has an `event` and a `code` (e.g. `RATE_LIMIT_IP`, `FORBIDDEN`). |
| Twenty backups | Daily (Twenty's own setup) | All form data lives in Twenty; the app stores nothing. |
| Secret rotation | If a secret may have leaked | Twenty key and Turnstile secret: replace in `.env.production`, restart. `LINK_TOKEN_SECRET`: same, but unused Form 1-3 links stop working; HR re-sends them. |
| New website | When it launches | With the project lead's approval: add it to `src/shared/config/sites.ts` and release (so it may embed the forms), add its Site in Twenty (active, or run `scripts/t2-sites.mjs`), then the embed snippet (step 8). |

## 11. Before go-live: housekeeping

- **Delete the development test records** in Twenty (Person "Atankeu Natanahel" `zoom+t5test@flomadlabs.com`, its two Applications, the test Inquiry, Form Submissions and References); the list of ids is kept for T16.
- **Data retention:** decide how long Applications, Form Submissions, References and Inquiries are kept and who deletes them (privacy law, e.g. GDPR, expects a limit). The app holds no data itself.

## Known limitations at launch (accepted)

- One app instance only (in-memory rate limits and per-link queue).
- The Content-Security-Policy allows inline scripts (Next.js needs them; a per-request nonce would remove this).
- Form 1-3 links expire **21 days** after they are created, and are single use; rotating `LINK_TOKEN_SECRET` revokes all unused links. HR sends a new link for an expired one.
- HR creates and sends Form 1-3 links by hand; the order of the forms is not enforced (automation and Amazon SES come later).
- Newsletter is single opt-in (double opt-in with Amazon SES is a future step).
