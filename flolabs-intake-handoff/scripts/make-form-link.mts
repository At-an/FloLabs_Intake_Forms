// T10: create a Form 1/2/3 link for one Application, for HR to send to the applicant.
// Run from flolabs-intake-handoff/ (needs LINK_TOKEN_SECRET and Twenty keys in .env.local):
//   npm run make-link -- <applicationId> <contacted|before-meeting|masterclass> [baseUrl]
// baseUrl defaults to http://localhost:3000. Checks that the Application exists first.
// The link is a personal, single-use access link: send it only to that applicant.
import { formLinkUrl, LINK_FORM_TYPES, type LinkFormType } from '../src/server/forms/link-tokens.ts';

const [applicationId, formArg, baseUrl = 'http://localhost:3000'] = process.argv.slice(2);
const formType = (Object.keys(LINK_FORM_TYPES) as LinkFormType[]).find(
  (type) => LINK_FORM_TYPES[type].path === formArg || type === formArg,
);
const secret = process.env.LINK_TOKEN_SECRET;
const base = process.env.TWENTY_BASE_URL?.replace(/\/+$/, '');

if (!applicationId || !formType) {
  console.error('Usage: npm run make-link -- <applicationId> <contacted|before-meeting|masterclass> [baseUrl]');
  process.exit(1);
}
if (!secret || secret.length < 32) {
  console.error('LINK_TOKEN_SECRET is missing or shorter than 32 characters in .env.local.');
  process.exit(1);
}

const res = await fetch(`${base}/graphql`, {
  method: 'POST',
  headers: { Authorization: `Bearer ${process.env.TWENTY_API_KEY}`, 'Content-Type': 'application/json' },
  body: JSON.stringify({
    query: 'query($id: UUID!) { applications(filter: { id: { eq: $id } }, first: 1) { edges { node { id name } } } }',
    variables: { id: applicationId },
  }),
});
const body = await res.json().catch(() => null);
const application = body?.data?.applications?.edges?.[0]?.node;
if (!application) {
  console.error(`No Application with id ${applicationId} (or Twenty could not be reached).`);
  process.exit(1);
}

console.log(`${LINK_FORM_TYPES[formType].label} link for "${application.name}":`);
console.log(formLinkUrl(baseUrl, { applicationId: application.id, formType }, secret));
