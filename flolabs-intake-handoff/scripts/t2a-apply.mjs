// T2a: Application schema changes (approved at Checkpoint A, 2026-10-24).
// Run from the repo root, one step at a time:
//   node --env-file=.env.local flolabs-intake-handoff/scripts/t2a-apply.mjs <positions|source|submissionKey>
// Existing select options are re-sent unchanged (same id, value, color); option updates replace the whole list.
// Never prints the API key.
import { randomUUID } from 'node:crypto';

const base = process.env.TWENTY_BASE_URL?.replace(/\/+$/, '');
const key = process.env.TWENTY_API_KEY;
const step = process.argv[2];
if (!base || !key) { console.error(JSON.stringify({ error: 'missing_env' })); process.exit(1); }

const APPLICATION_OBJECT_ID = 'bc3256dd-c95f-4ee1-b71a-3de66bb2a815';
const POSITIONS_FIELD_ID = '1716ccd1-c9f9-4cf7-9f70-3d5eb8832c02';
const SOURCE_FIELD_ID = '72eb2fa5-3426-4046-9e73-7afba51281c5';
const COLORS = ['green', 'turquoise', 'sky', 'blue', 'purple', 'pink', 'red', 'orange', 'yellow', 'gray'];

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

const getField = async (id) => (await gql(`query($id: UUID!) { field(id: $id) { id name label options } }`, { id })).field;

const updateField = (id, update) =>
  gql(`mutation($input: UpdateOneFieldMetadataInput!) { updateOneField(input: $input) { id name label options } }`, { input: { id, update } });

const newOption = (value, label, position) => ({ id: randomUUID(), value, label, position, color: COLORS[position % COLORS.length] });

function report(before, after) {
  const beforeIds = new Set(before.options.map((o) => o.id));
  const afterIds = new Set(after.options.map((o) => o.id));
  console.log(JSON.stringify({
    field: after.name,
    label: after.label,
    optionsBefore: before.options.length,
    optionsAfter: after.options.length,
    removed: before.options.filter((o) => !afterIds.has(o.id)).map((o) => o.value),
    valueChanged: before.options.filter((o) => after.options.some((a) => a.id === o.id && a.value !== o.value)).map((o) => o.value),
    added: after.options.filter((o) => !beforeIds.has(o.id)).map((o) => o.value),
  }));
}

if (step === 'positions') {
  const before = await getField(POSITIONS_FIELD_ID);
  if (before.options.some((o) => o.value === 'BACKEND_DEVELOPER_INTERN')) throw new Error('already_applied');
  const options = [...before.options, newOption('BACKEND_DEVELOPER_INTERN', 'Backend Developer Intern', before.options.length)];
  const { updateOneField: after } = await updateField(POSITIONS_FIELD_ID, { label: 'Programs Applied For', isLabelSyncedWithName: false, options });
  report(before, after);
} else if (step === 'source') {
  const before = await getField(SOURCE_FIELD_ID);
  if (before.options.some((o) => o.value === 'REFERRAL')) throw new Error('already_applied');
  const relabel = {
    INDEED_COM: 'Indeed', GLASSDOOR_COM: 'Glassdoor', GOOGLE_COM: 'Google', FACEBOOK_COM: 'Facebook',
    INSTAGRAM_COM: 'Instagram', LINKEDIN_COM: 'LinkedIn', SIMPLYHIRED_COM: 'SimplyHired',
    NORTHEASTERN_UNIVERSITY_S_INTERNAL_JOB_PORTAL: "Northeastern University's Internal Job Portal",
  };
  const added = [
    ['TIKTOK', 'TikTok'], ['REDDIT', 'Reddit'], ['YOUTUBE', 'YouTube'], ['X_TWITTER', 'X (Twitter)'],
    ['COMPANY_WEBSITE', 'Company Website'], ['JOB_BOARD', 'Job Board'], ['EVENT', 'Event'], ['REFERRAL', 'Referral'],
  ];
  // Keep "Other" last: existing options first, then the new ones, then Other.
  const existing = before.options.filter((o) => o.value !== 'OTHER').map((o) => ({ ...o, label: relabel[o.value] ?? o.label }));
  const other = before.options.find((o) => o.value === 'OTHER');
  const fresh = added.map(([value, label], i) => newOption(value, label, existing.length + i));
  const options = [...existing, ...fresh, { ...other, position: existing.length + fresh.length }];
  const { updateOneField: after } = await updateField(SOURCE_FIELD_ID, { options });
  report(before, after);
} else if (step === 'submissionKey') {
  const field = {
    objectMetadataId: APPLICATION_OBJECT_ID,
    type: 'TEXT',
    name: 'submissionKey',
    label: 'Submission Key',
    description: 'Client-generated UUID used for retry protection (idempotency).',
    icon: 'IconKey',
    isNullable: true,
  };
  const { createOneField } = await gql(`mutation($input: CreateOneFieldMetadataInput!) { createOneField(input: $input) { id name label type } }`, { input: { field } });
  console.log(JSON.stringify(createOneField));
} else {
  console.error(JSON.stringify({ error: 'unknown_step', expected: ['positions', 'source', 'submissionKey'] }));
  process.exit(1);
}
