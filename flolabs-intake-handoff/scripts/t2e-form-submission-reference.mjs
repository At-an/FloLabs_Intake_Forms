// T2b (rest): Form Submission and Reference objects (spec section 7, approved at Checkpoint A).
// Run from flolabs-intake-handoff/ (where .env.local lives):
//   node --env-file=.env.local scripts/t2e-form-submission-reference.mjs
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
  const error = body?.errors?.[0];
  if (!res.ok || error) throw new Error(`metadata ${res.status} ${error?.extensions?.userFriendlyMessage ?? error?.message ?? ''}`);
  return body.data;
}

const loadObjects = async () =>
  new Map(
    (await gql(`{ objects(paging: { first: 200 }) { edges { node { id nameSingular fields(paging: { first: 500 }) { edges { node { id name label } } } } } } }`))
      .objects.edges.map(({ node }) => [node.nameSingular, { id: node.id, fields: new Map(node.fields.edges.map((e) => [e.node.name, e.node])) }]),
  );

const options = (list) => list.map(([value, label, color], position) => ({ id: randomUUID(), value, label, color, position }));

async function ensureObject(object) {
  const objects = await loadObjects();
  if (objects.has(object.nameSingular)) return console.log(JSON.stringify({ object: object.nameSingular, action: 'exists' }));
  const { createOneObject } = await gql(`mutation($input: CreateOneObjectInput!) { createOneObject(input: $input) { id nameSingular } }`, { input: { object } });
  console.log(JSON.stringify({ action: 'created object', ...createOneObject }));
}

async function ensureField(objectName, field) {
  const object = (await loadObjects()).get(objectName);
  if (object.fields.has(field.name)) return console.log(JSON.stringify({ object: objectName, field: field.name, action: 'exists' }));
  const { createOneField } = await gql(
    `mutation($input: CreateOneFieldMetadataInput!) { createOneField(input: $input) { id name type } }`,
    { input: { field: { isNullable: true, ...field, objectMetadataId: object.id } } },
  );
  console.log(JSON.stringify({ object: objectName, action: 'created', ...createOneField }));
}

const applicationRelation = (targetFieldLabel) => async () => {
  const applicationId = (await loadObjects()).get('application').id;
  return { type: 'MANY_TO_ONE', targetObjectMetadataId: applicationId, targetFieldLabel, targetFieldIcon: 'IconForms' };
};

// ---- Form Submission (Forms 1-3) ----
await ensureObject({
  nameSingular: 'formSubmission',
  namePlural: 'formSubmissions',
  labelSingular: 'Form Submission',
  labelPlural: 'Form Submissions',
  description: 'Answers to Form 1 (Contacted), Form 2 (Before Meeting) and Form 3 (Masterclass).',
  icon: 'IconForms',
});
const fs = 'formSubmission';
await ensureField(fs, {
  type: 'SELECT', name: 'formType', label: 'Form Type', icon: 'IconForms',
  options: options([['CONTACTED', 'Contacted', 'blue'], ['BEFORE_MEETING', 'Before Meeting', 'purple'], ['MASTERCLASS', 'Masterclass', 'green']]),
});
await ensureField(fs, {
  type: 'MULTI_SELECT', name: 'tracks', label: 'Tracks', icon: 'IconRoute',
  options: options([
    ['AI_SOFTWARE_ENGINEERING', 'AI & Software Engineering', 'blue'],
    ['ROBOTICS_INTELLIGENT_SYSTEMS', 'Robotics & Intelligent Systems', 'turquoise'],
    // Twenty option labels may not contain commas; the form shows the official name.
    ['BUSINESS_GROWTH_ENTREPRENEURSHIP', 'Business Management / Growth & Entrepreneurship', 'orange'],
    ['DESIGN_TECHNICAL_COMMUNICATION', 'Design & Technical Communication', 'pink'],
    ['EMERGING_SCIENCES_TECHNOLOGY', 'Emerging Sciences & Technology', 'purple'],
  ]),
});
await ensureField(fs, { type: 'TEXT', name: 'formVersion', label: 'Form Version', icon: 'IconVersions' });
await ensureField(fs, { type: 'DATE_TIME', name: 'submittedAt', label: 'Submitted At', icon: 'IconCalendar' });
await ensureField(fs, { type: 'TEXT', name: 'submissionKey', label: 'Submission Key', icon: 'IconKey', description: 'Client-generated UUID used for retry protection (idempotency).' });
await ensureField(fs, { type: 'RAW_JSON', name: 'answers', label: 'Answers', icon: 'IconBraces', description: 'All answers, keyed by question id (source of truth).' });
await ensureField(fs, { type: 'RICH_TEXT', name: 'answersSummary', label: 'Answers Summary', icon: 'IconFileText', description: 'Readable summary generated from Answers for HR and marketing.' });
await ensureField(fs, { type: 'NUMBER', name: 'hoursPerWeek', label: 'Hours Per Week', icon: 'IconClock', settings: { decimals: 0 } });
await ensureField(fs, {
  type: 'SELECT', name: 'commitmentDuration', label: 'Commitment Duration', icon: 'IconHourglass',
  options: options([['UNDER_3_MONTHS', 'Under 3 months', 'red'], ['MONTHS_3_TO_6', '3-6 months', 'orange'], ['MONTHS_6_TO_12', '6-12 months', 'turquoise'], ['OVER_12_MONTHS', 'Over 12 months', 'green']]),
});
await ensureField(fs, { type: 'BOOLEAN', name: 'remoteOk', label: 'Comfortable Working Remotely', icon: 'IconHome' });
await ensureField(fs, { type: 'BOOLEAN', name: 'canAttendMeetings', label: 'Can Attend Meetings', icon: 'IconUsers' });
await ensureField(fs, {
  type: 'SELECT', name: 'stillInterested', label: 'Still Interested', icon: 'IconHeart',
  options: options([['YES_DEFINITELY', 'Yes definitely', 'green'], ['YES_WITH_QUESTIONS', 'Yes but I have questions', 'turquoise'], ['UNSURE', "I'm unsure", 'orange'], ['NO', 'No', 'red']]),
});
await ensureField(fs, { type: 'BOOLEAN', name: 'continueToInterview', label: 'Continue To Interview', icon: 'IconArrowRight' });
await ensureField(fs, {
  type: 'SELECT', name: 'canMeetCommitment', label: 'Can Meet Commitment', icon: 'IconCheck',
  options: options([['YES', 'Yes', 'green'], ['NO', 'No', 'red'], ['NEED_TO_DISCUSS', 'I need to discuss my availability', 'orange']]),
});
await ensureField(fs, { type: 'BOOLEAN', name: 'referencesContactAllowed', label: 'References May Be Contacted', icon: 'IconPhoneCall' });
await ensureField(fs, { type: 'RELATION', name: 'application', label: 'Application', icon: 'IconFileDescription', relationCreationPayload: await applicationRelation('Form Submissions')() });

// ---- Reference (Form 3) ----
await ensureObject({
  nameSingular: 'reference',
  namePlural: 'references',
  labelSingular: 'Reference',
  labelPlural: 'References',
  description: 'References given by applicants in Form 3 (Masterclass).',
  icon: 'IconUserCheck',
});
// The built-in Name field holds the reference's full name.
const nameField = (await loadObjects()).get('reference').fields.get('name');
if (nameField && nameField.label !== 'Full Name') {
  await gql(`mutation($input: UpdateOneFieldMetadataInput!) { updateOneField(input: $input) { id label } }`, {
    input: { id: nameField.id, update: { label: 'Full Name', isLabelSyncedWithName: false } },
  });
  console.log(JSON.stringify({ object: 'reference', field: 'name', action: 'relabelled', label: 'Full Name' }));
}
const ref = 'reference';
await ensureField(ref, { type: 'TEXT', name: 'title', label: 'Position / Title', icon: 'IconBriefcase' });
await ensureField(ref, { type: 'TEXT', name: 'organization', label: 'Organization / Institution', icon: 'IconBuilding' });
await ensureField(ref, { type: 'TEXT', name: 'relationship', label: 'Relationship', icon: 'IconUsers' });
await ensureField(ref, { type: 'EMAILS', name: 'email', label: 'Email', icon: 'IconMail' });
await ensureField(ref, { type: 'PHONES', name: 'phone', label: 'Phone', icon: 'IconPhone' });
await ensureField(ref, {
  type: 'SELECT', name: 'knownDuration', label: 'Known Duration', icon: 'IconHourglass',
  options: options([['MONTHS_0_TO_6', '0-6 months', 'orange'], ['MONTHS_6_TO_12', '6-12 months', 'turquoise'], ['YEARS_1_TO_2', '1-2 years', 'blue'], ['YEARS_2_TO_3', '2-3 years', 'green']]),
});
await ensureField(ref, { type: 'RELATION', name: 'application', label: 'Application', icon: 'IconFileDescription', relationCreationPayload: await applicationRelation('References')() });
