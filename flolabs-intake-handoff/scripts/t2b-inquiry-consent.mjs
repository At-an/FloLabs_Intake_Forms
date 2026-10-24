// T2b (part used by T8/T9): Inquiry object (Contact Us) and Person consent fields (Newsletter).
// Approved at Checkpoint A (2026-10-24); Person consent field names approved the same day.
// Run from flolabs-intake-handoff/ (where .env.local lives):
//   node --env-file=.env.local scripts/t2b-inquiry-consent.mjs
// Idempotent: existing objects and fields are skipped, never changed. Never prints the API key.
import { randomUUID } from 'node:crypto';

const base = process.env.TWENTY_BASE_URL?.replace(/\/+$/, '');
const key = process.env.TWENTY_API_KEY;
if (!base || !key) { console.error(JSON.stringify({ error: 'missing_env' })); process.exit(1); }

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

const loadObjects = async () =>
  new Map(
    (await gql(`{ objects(paging: { first: 200 }) { edges { node { id nameSingular fields(paging: { first: 500 }) { edges { node { name } } } } } } }`))
      .objects.edges.map(({ node }) => [node.nameSingular, { id: node.id, fields: new Set(node.fields.edges.map((e) => e.node.name)) }]),
  );

async function ensureField(objectName, field) {
  const objects = await loadObjects();
  const object = objects.get(objectName);
  if (object.fields.has(field.name)) return console.log(JSON.stringify({ object: objectName, field: field.name, action: 'exists' }));
  const { createOneField } = await gql(
    `mutation($input: CreateOneFieldMetadataInput!) { createOneField(input: $input) { id name type } }`,
    { input: { field: { isNullable: true, ...field, objectMetadataId: object.id } } },
  );
  console.log(JSON.stringify({ object: objectName, action: 'created', ...createOneField }));
}

// 1. Inquiry object
let objects = await loadObjects();
if (!objects.has('inquiry')) {
  const { createOneObject } = await gql(
    `mutation($input: CreateOneObjectInput!) { createOneObject(input: $input) { id nameSingular } }`,
    {
      input: {
        object: {
          nameSingular: 'inquiry',
          namePlural: 'inquiries',
          labelSingular: 'Inquiry',
          labelPlural: 'Inquiries',
          description: 'Messages sent through the Contact Us form on FloLabs websites.',
          icon: 'IconMessage',
        },
      },
    },
  );
  console.log(JSON.stringify({ action: 'created object', ...createOneObject }));
} else {
  console.log(JSON.stringify({ object: 'inquiry', action: 'exists' }));
}
objects = await loadObjects();

await ensureField('inquiry', { type: 'TEXT', name: 'subject', label: 'Subject', icon: 'IconHeading' });
await ensureField('inquiry', { type: 'TEXT', name: 'message', label: 'Message', icon: 'IconMessage' });
await ensureField('inquiry', {
  type: 'SELECT',
  name: 'status',
  label: 'Status',
  icon: 'IconProgress',
  defaultValue: "'NEW'",
  options: [
    ['NEW', 'New', 'blue'],
    ['IN_PROGRESS', 'In progress', 'orange'],
    ['CLOSED', 'Closed', 'green'],
  ].map(([value, label, color], position) => ({ id: randomUUID(), value, label, color, position })),
});
await ensureField('inquiry', { type: 'DATE_TIME', name: 'submittedAt', label: 'Submitted At', icon: 'IconCalendar' });
await ensureField('inquiry', {
  type: 'TEXT',
  name: 'submissionKey',
  label: 'Submission Key',
  icon: 'IconKey',
  description: 'Client-generated UUID used for retry protection (idempotency).',
});
await ensureField('inquiry', {
  type: 'RELATION',
  name: 'person',
  label: 'Person',
  icon: 'IconUser',
  relationCreationPayload: { type: 'MANY_TO_ONE', targetObjectMetadataId: objects.get('person').id, targetFieldLabel: 'Inquiries', targetFieldIcon: 'IconMessage' },
});
await ensureField('inquiry', {
  type: 'RELATION',
  name: 'site',
  label: 'Site',
  icon: 'IconWorld',
  relationCreationPayload: { type: 'MANY_TO_ONE', targetObjectMetadataId: objects.get('site').id, targetFieldLabel: 'Inquiries', targetFieldIcon: 'IconMessage' },
});

// 2. Person consent fields (Newsletter, spec D17)
await ensureField('person', { type: 'BOOLEAN', name: 'communicationConsent', label: 'Communication Consent', icon: 'IconMail', defaultValue: false });
await ensureField('person', { type: 'DATE_TIME', name: 'communicationConsentAt', label: 'Communication Consent At', icon: 'IconCalendar' });
await ensureField('person', { type: 'TEXT', name: 'consentVersion', label: 'Consent Version', icon: 'IconFileText' });
await ensureField('person', {
  type: 'TEXT',
  name: 'communicationConsentSite',
  label: 'Communication Consent Site',
  icon: 'IconWorld',
  description: 'Site key of the website where the newsletter sign-up happened.',
});
