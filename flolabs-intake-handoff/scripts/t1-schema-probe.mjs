// T1: read-only Twenty schema snapshot.
// Run from the repo root:
//   node --env-file=.env.local flolabs-intake-handoff/scripts/t1-schema-probe.mjs <out.json>
// Reads metadata only (via GraphQL /metadata; REST /rest/metadata returns 403 for this key),
// Site id/name/siteId/hostname, and record counts. No People or Application records are read.
// Never prints the API key. Re-run after T2 and diff the two snapshots.
import { writeFileSync } from 'node:fs';

const base = process.env.TWENTY_BASE_URL?.replace(/\/+$/, '');
const key = process.env.TWENTY_API_KEY;
const outFile = process.argv[2];
if (!base || !key || !outFile) {
  console.error(JSON.stringify({ error: 'missing_env_or_outfile', hasBase: !!base, hasKey: !!key, hasOutFile: !!outFile }));
  process.exit(1);
}

const OBJECTS = ['person', 'application', 'site', 'attachment', 'subscription', 'inquiry', 'formSubmission', 'reference'];

async function gql(endpoint, query) {
  const res = await fetch(`${base}${endpoint}`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ query }),
  });
  const body = await res.json().catch(() => null);
  if (!res.ok || body?.errors) throw new Error(`${endpoint} ${res.status} ${body?.errors?.[0]?.message ?? ''}`);
  return body.data;
}

const meta = await gql('/metadata', `{ objects(paging:{first:200}) { edges { node { id nameSingular namePlural labelSingular
  fields(paging:{first:500}) { edges { node { id name label type isActive isSystem isNullable defaultValue options settings
    relation { type targetObjectMetadata { nameSingular } targetFieldMetadata { name } } } } } } } } }`);

const objects = {};
for (const { node: o } of meta.objects.edges) {
  if (!OBJECTS.includes(o.nameSingular)) continue;
  objects[o.nameSingular] = {
    id: o.id,
    namePlural: o.namePlural,
    label: o.labelSingular,
    fields: o.fields.edges
      .map(({ node: f }) => ({
        id: f.id, name: f.name, label: f.label, type: f.type, isSystem: f.isSystem, isNullable: f.isNullable,
        ...(f.options && { options: f.options.map(({ value, label }) => ({ value, label })) }),
        ...(f.relation && { relation: `${f.relation.type} ${f.relation.targetObjectMetadata.nameSingular}.${f.relation.targetFieldMetadata.name}` }),
        ...(f.settings && { settings: f.settings }),
      }))
      .sort((a, b) => a.name.localeCompare(b.name)),
  };
}

const sites = await gql('/graphql', '{ sites { edges { node { id name siteId hostname active } } } }');
const counts = await gql('/graphql', '{ people { totalCount } applications { totalCount } attachments { totalCount } }');
const mutations = await gql('/metadata', '{ __schema { mutationType { fields { name } } } }');
const uploadMutations = mutations.__schema.mutationType.fields.map((f) => f.name).filter((n) => /^(create|complete)FileUpload$/.test(n));

writeFileSync(outFile, JSON.stringify({
  takenAt: new Date().toISOString(),
  objects,
  sites: sites.sites.edges.map((e) => e.node),
  counts: Object.fromEntries(Object.entries(counts).map(([k, v]) => [k, v.totalCount])),
  uploadMutations,
}, null, 2));

console.log(JSON.stringify({ ok: true, objects: Object.keys(objects), sites: sites.sites.edges.length, uploadMutations }));
