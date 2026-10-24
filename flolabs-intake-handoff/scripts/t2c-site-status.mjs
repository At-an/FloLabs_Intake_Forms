// T2c: Application site-status fields (approved 2026-10-24).
// Run from flolabs-intake-handoff/ (where .env.local lives):
//   node --env-file=.env.local scripts/t2c-site-status.mjs
// Adds siteStatus (SELECT) and siteKeyReceived (TEXT). Skips a field that already exists.
// Never prints the API key.
import { randomUUID } from 'node:crypto';

const base = process.env.TWENTY_BASE_URL?.replace(/\/+$/, '');
const key = process.env.TWENTY_API_KEY;
if (!base || !key) { console.error(JSON.stringify({ error: 'missing_env' })); process.exit(1); }

const APPLICATION_OBJECT_ID = 'bc3256dd-c95f-4ee1-b71a-3de66bb2a815';

async function gql(query, variables) {
  const res = await fetch(`${base}/metadata`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ query, variables }),
  });
  const body = await res.json().catch(() => null);
  if (!res.ok || body?.errors) throw new Error(`metadata ${res.status} ${body?.errors?.[0]?.message ?? ''}`);
  return body.data;
}

const FIELDS = [
  {
    type: 'SELECT',
    name: 'siteStatus',
    label: 'Site Status',
    description: 'Whether the application link carried a valid site key.',
    icon: 'IconWorld',
    options: [
      ['KNOWN', 'Known', 'green'],
      ['MISSING', 'Missing', 'gray'],
      ['UNKNOWN', 'Unknown', 'orange'],
      ['INACTIVE', 'Inactive', 'red'],
    ].map(([value, label, color], position) => ({ id: randomUUID(), value, label, color, position })),
  },
  {
    type: 'TEXT',
    name: 'siteKeyReceived',
    label: 'Site Key Received',
    description: 'The site key exactly as it appeared in the application link (max 64 characters).',
    icon: 'IconLink',
  },
];

const existing = await gql(`{ objects(paging: { first: 200 }) { edges { node { id fields(paging: { first: 500 }) { edges { node { name } } } } } } }`);
const application = existing.objects.edges.find((e) => e.node.id === APPLICATION_OBJECT_ID);
const names = new Set(application.node.fields.edges.map((e) => e.node.name));

for (const field of FIELDS) {
  if (names.has(field.name)) {
    console.log(JSON.stringify({ field: field.name, action: 'exists' }));
    continue;
  }
  const { createOneField } = await gql(
    `mutation($input: CreateOneFieldMetadataInput!) { createOneField(input: $input) { id name label type } }`,
    { input: { field: { ...field, objectMetadataId: APPLICATION_OBJECT_ID, isNullable: true } } },
  );
  console.log(JSON.stringify({ action: 'created', ...createOneField }));
}
