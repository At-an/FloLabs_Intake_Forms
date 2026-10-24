# FloLabs Intake Forms

The intake forms for FloLabs' intern recruitment and websites, writing straight into a self-hosted [Twenty](https://twenty.com) CRM. They replace the earlier HubSpot forms.

- **Application form:** embedded on any FloLabs website (iframe) or shared as a link. Saves the applicant, the Application and the CV.
- **Forms 1-3:** personal, single-use links that HR sends during the pipeline (Contacted, Before Meeting, Masterclass). Multi-step, with questions tailored to the applicant's programs; Form 3 collects two references.
- **Contact Us** and **Newsletter:** embedded on any FloLabs website.

Built with Next.js, TypeScript, Zod and Vitest; protected by Cloudflare Turnstile and rate limits. The browser never talks to the CRM directly.

## Where to start

The app and all documentation live in [`flolabs-intake-handoff/`](flolabs-intake-handoff/).

| You are... | Read |
|---|---|
| HR | [HR guide](flolabs-intake-handoff/docs/hr-guide.md): the process, the forms, every field, what to tell applicants |
| Deploying or running it | [Production launch runbook](flolabs-intake-handoff/docs/production-launch.md) |
| A developer | [Implementation report](flolabs-intake-handoff/docs/implementation-report.md), then [`CLAUDE.md`](flolabs-intake-handoff/CLAUDE.md), the [spec](flolabs-intake-handoff/docs/intake-forms-spec.md) and the [Twenty schema map](flolabs-intake-handoff/docs/twenty-schema.md) |

## Run it locally

```bash
cd flolabs-intake-handoff
npm ci
cp .env.example .env.local   # add your Twenty API key; never commit this file
npm run dev                  # http://localhost:3000/apply
npm test
```

## Branches

- `develop`: day-to-day work, through pull requests.
- `main`: production releases (pull request from `develop`, then a `vX.Y.Z` tag).
