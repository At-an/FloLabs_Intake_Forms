# Local HR mailbox integration

## Status and boundaries

The HR workflow can generate copyable drafts and a manually invoked, allowlist-gated SMTP test. IMAP synchronization imports plain-text messages into a local SQLite database and groups replies only when `In-Reply-To` or `References` matches a stored message ID. A reply to an HR message carries forward that original message's Twenty person and Application IDs in the local database.

This does **not** create or display email threads inside Twenty. The inspected project client supports person and application operations but has no tenant-verified email-message/thread mutation or query operation. Current public Twenty upstream source documents a native `sendEmail` GraphQL mutation with connected-account and permission requirements, and native targets for Person, Company, or Opportunity; this is not evidence that the configured workspace exposes that API or has a connected mailbox. The native target mapping does not include this project's custom Application object. The local SQLite database is an application-level test representation, not a CRM API or production deployment. No HubSpot email credentials or authorized email configuration are available in this repository. Bulk marketing campaigns remain deferred; the HR test sender does not call the marketing eligibility or suppression service and must not be reused for marketing.

The lower-level SMTP sender additionally requires an explicit `purpose`. `HR_TEST` is restricted to the configured test-recipient allowlist. `MARKETING` is not a campaign feature: it is blocked unless a topic and an eligibility check are supplied, and it fails closed on missing consent, suppression, or lookup failure. No current command wires this guarded path to a live CRM and suppression store, and bulk sending remains disabled.

The regular `make-email-draft` command remains draft-only. The separate `send-hr-email:test` command is for a controlled, explicitly allowlisted test recipient. SMTP acceptance alone does not prove delivery.

## Backend-only configuration

Copy `.env.example` to `.env.local` and configure these values locally. `.env*`, `.local/`, and SQLite databases are ignored by Git. Use the operating system's protected local secret storage or a secret manager to populate the password; do not put credentials in source, shell arguments/history, frontend variables, screenshots, or logs.

```dotenv
CRM_EMAIL_IMAP_HOST=flolabsinnovations.com
CRM_EMAIL_IMAP_PORT=993
CRM_EMAIL_IMAP_USERNAME=crm.test1@flolabsinnovations.com
CRM_EMAIL_IMAP_PASSWORD=<secret from authorized secret store>
CRM_EMAIL_SMTP_HOST=flolabsinnovations.com
CRM_EMAIL_SMTP_PORT=465
CRM_EMAIL_SMTP_USERNAME=crm.test1@flolabsinnovations.com
CRM_EMAIL_SMTP_PASSWORD=<secret from authorized secret store>
CRM_EMAIL_ALLOWED_RECIPIENTS=crm.test1@flolabsinnovations.com
CRM_EMAIL_DATABASE_PATH=.local/email.sqlite
CRM_EMAIL_TEST_COMMANDS_ENABLED=true
```

The test commands require the explicit `CRM_EMAIL_TEST_COMMANDS_ENABLED=true` opt-in and refuse to run when `NODE_ENV=production`. The code requires implicit TLS on IMAP 993 and SMTP 465, and rejects partial settings, invalid addresses, missing allowlists, and missing database paths. The database path must be under `.local`; the database is created with owner-only permissions where supported. Windows users must also ensure the `.local` directory ACL allows access only to the authorized account. Email text is stored locally to make the thread test inspectable; use an encrypted disk and do not use real applicant content for tests. Attachments and HTML bodies are not stored.

Inbox sync and local inspection validate only the mailbox settings and do not require CRM credentials. The HR send command also needs the existing Twenty base URL and API key to look up the test Application, plus `LINK_TOKEN_SECRET` to create the personal links. Configuration errors list variable names only.

## Safe local procedure

1. Obtain explicit authorization for the recipient and a test-only Twenty Application whose primary email equals that recipient. Do not use an applicant record or production data. Keep that address in `CRM_EMAIL_ALLOWED_RECIPIENTS`; all other recipients are refused.
2. Confirm with the mailbox owner that the supplied test account is enabled for authenticated IMAP/SMTP and the execution host is authorized to connect. Credentials are not checked into this repository.
3. Run the draft-only command first and inspect the generated personal links. They remain single-use and expire after 21 days:

   ```powershell
   npm run make-email-draft -- <test-application-id> contacted https://<test-forms-origin>
   ```

4. For an approved controlled send only, use a fresh unique idempotency key:

   ```powershell
   npm run send-hr-email:test -- <test-application-id> contacted https://<test-forms-origin> <unique-test-key>
   ```

   The command refuses addresses outside the allowlist. A failed or interrupted send reservation is not automatically retried because an SMTP disconnect may happen after remote acceptance; inspect the mailbox before any new attempt.
5. Synchronize the mailbox and inspect only the resulting local test database through an approved secure tool:

   ```powershell
   npm run sync-crm-email:test
   ```

6. Reply from an explicitly approved test account to the message. Run sync again, then inspect the sanitized association metadata:

   ```powershell
   npm run sync-crm-email:test
   npm run inspect-crm-email:test
   ```

   Verify the reply and original have the same `threadId`, `contactId`, and `applicationId`. Run sync again to confirm the UID duplicate is skipped. The inspection command does not print bodies or addresses. A recipient inbox delivery check is still required; provider acceptance is insufficient.

Automated mocked SMTP, IMAP, parsing, deduplication, thread matching, configuration, and redaction tests run with `npm test -- src/server/email/mailbox.test.ts src/server/env.test.ts`.

## Production and CRM limitations

- No live mailbox credential is in the repository's `.env.local`, and no approved test Application/recipient or authorization to connect/send was available during this implementation. No real network connection, send, receive, or reply test was performed.
- The SQLite store is local and not shared with the running application or Twenty. It has no production backup, retention, encryption-at-rest, access-control, or deployment design. Do not deploy this as the production mail store.
- Twenty contact/Application IDs are attached to locally synchronized email only when a reply matches an outgoing message by standard message headers. Unmatched mail stays unassociated. There is no verified native Twenty thread API, and no claim is made that messages appear in Twenty.
- To assess native Twenty integration, the team must provide the target workspace's API URL/version and its schema/playground output, confirm the native `sendEmail` and thread-query operations are available, authorize the required connected test mailbox and `SEND_EMAIL_TOOL` permission, and approve the test recipient and record. Application association needs a workspace-supported relationship or an approved schema/API extension; the public upstream native target mapping currently covers Person, Company, and Opportunity only.
- HubSpot is not configured here; no interim HubSpot send/receive test was possible.
- SMTP feedback/bounce/complaint processing remains the separately tested but undeployed SES/SNS/Lambda path. The mailbox SMTP integration does not configure SES and cannot claim delivery/bounce feedback.
- Before production use, the team must approve a persistent encrypted message store, retention/access policy, mailbox credentials and network egress, a real sender identity and recipient policy, provider feedback handling, and an actual Twenty-supported message/thread model plus permissions. Marketing requires explicit consent and active suppression checks at the sender; no campaign sender is implemented.
