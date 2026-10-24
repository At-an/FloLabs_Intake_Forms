// T2d: Inquiry site-status fields (approved 2026-10-24), same as T2c on Application.
// Run from flolabs-intake-handoff/ (where .env.local lives):
//   node --env-file=.env.local scripts/t2d-inquiry-site-status.mjs
// Adds siteStatus (SELECT) and siteKeyReceived (TEXT). Skips a field that already exists.
// Never prints the API key.
import { randomUUID } from 'node:crypto';

const base = process.env.TWENTY_BASE_URL?.replace(/\/+$/, '');
const key = process.env.TWENTY_API_KEY;
if (!base || !key) { console.error(JSON.stringify({ error: 'missing_env' })); process.exit(1); }

const INQUIRY_OBJECT_ID = '4c3e95a3-0373-4f1f-91b1-55e7845cf78c'; // Inquiry object id

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
    description: 'Whether the embedding website sent a valid site key.',
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
    description: 'The site key exactly as the website sent it (max 64 characters).',
    icon: 'IconLink',
  },
];

const existing = await gql(`{ objects(paging: { first: 200 }) { edges { node { id fields(paging: { first: 500 }) { edges { node { name } } } } } } }`);
const application = existing.objects.edges.find((e) => e.node.id === INQUIRY_OBJECT_ID);
const names = new Set(application.node.fields.edges.map((e) => e.node.name));

for (const field of FIELDS) {
  if (names.has(field.name)) {
    console.log(JSON.stringify({ field: field.name, action: 'exists' }));
    continue;
  }
  const { createOneField } = await gql(
    `mutation($input: CreateOneFieldMetadataInput!) { createOneField(input: $input) { id name label type } }`,
    { input: { field: { ...field, objectMetadataId: INQUIRY_OBJECT_ID, isNullable: true } } },
  );
  console.log(JSON.stringify({ action: 'created', ...createOneField }));
}
