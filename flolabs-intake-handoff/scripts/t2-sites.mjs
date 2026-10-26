// Create the FloLabs Site records in Twenty (approved 2026-10-24).
// Run from flolabs-intake-handoff/ (where .env.local lives):
//   node --env-file=.env.local scripts/t2-sites.mjs
// Idempotent: a site_id that already exists is compared, never duplicated or overwritten.
// Never prints the API key.
import { SITES as REGISTRY } from '../src/shared/config/sites.ts';

const base = process.env.TWENTY_BASE_URL?.replace(/\/+$/, '');
const key = process.env.TWENTY_API_KEY;
if (!base || !key) { console.error(JSON.stringify({ error: 'missing_env' })); process.exit(1); }

// The canonical list lives in src/shared/config/sites.ts. Twenty stores the hostname without
// https://. Flomad is created inactive until its site is fixed; switch it on in Twenty.
const INACTIVE = new Set(['flomad']);
const SITES = REGISTRY.map(({ siteId, name, origin }) => ({ siteId, name, hostname: new URL(origin).hostname, active: !INACTIVE.has(siteId) }));

async function gql(query, variables) {
  const res = await fetch(`${base}/graphql`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ query, variables }),
  });
  const body = await res.json().catch(() => null);
  if (!res.ok || body?.errors) throw new Error(`graphql ${res.status} ${body?.errors?.[0]?.message ?? ''}`);
  return body.data;
}

const existing = new Map(
  (await gql('{ sites(first: 200) { edges { node { id siteId name hostname active } } } }')).sites.edges.map(
    ({ node }) => [node.siteId, node],
  ),
);

for (const site of SITES) {
  const current = existing.get(site.siteId);
  if (current) {
    const diff = ['name', 'hostname', 'active'].filter((k) => current[k] !== site[k]);
    console.log(JSON.stringify({ siteId: site.siteId, action: 'exists', id: current.id, differs: diff }));
    continue;
  }
  const { createSite } = await gql('mutation($data: SiteCreateInput!) { createSite(data: $data) { id siteId active } }', { data: site });
  console.log(JSON.stringify({ siteId: site.siteId, action: 'created', id: createSite.id, active: createSite.active }));
}
