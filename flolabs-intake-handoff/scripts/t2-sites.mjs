// Create the FloLabs Site records in Twenty (approved 2026-10-24).
// Run from flolabs-intake-handoff/ (where .env.local lives):
//   node --env-file=.env.local scripts/t2-sites.mjs
// Idempotent: a site_id that already exists is compared, never duplicated or overwritten.
// Never prints the API key.

const base = process.env.TWENTY_BASE_URL?.replace(/\/+$/, '');
const key = process.env.TWENTY_API_KEY;
if (!base || !key) { console.error(JSON.stringify({ error: 'missing_env' })); process.exit(1); }

// Source: site list provided by the user on 2026-10-24. Flomad is inactive until its site is fixed.
const SITES = [
  ['athletic_performance_intelligence', 'Athletic Performance Intelligence', 'www.athleticperformanceintelligence.com'],
  ['bootcamp_university', 'Bootcamp University', 'www.bootcampuniversity.org'],
  ['caipo', 'CAIPO', 'www.caipo.ai'],
  ['cosmos_intelligence', 'Cosmos Intelligence', 'www.cosmosintelligence.org'],
  ['flo_studios', 'Flo Studios', 'www.flostudios.ai'],
  ['flobrain', 'FloBrain', 'www.flobrain.ai'],
  ['flolabs_innovations_group', 'FloLabs Innovations Group', 'www.flolabsinnovations.com'],
  ['flolabs_international', 'FloLabs International', 'www.flolabs.international'],
  ['flomad', 'Flomad', 'www.flomad.com', false],
  ['flomad_travel', 'Flomad Travel', 'www.flomadtravel.com'],
  ['hephaestus_international', 'Hephaestus International', 'www.hephaestus.international'],
  ['legal_ethics_ventures_institute', 'Legal Ethics Ventures Institute', 'www.legalethicsventuresinstitute.com'],
  ['moodchanger', 'Moodchanger', 'www.moodchanger.ai'],
  ['robocollective', 'Robocollective', 'www.robocollective.ai'],
  ['space_ventures_institute', 'Space Ventures Institute', 'www.spaceventuresinstitute.com'],
  ['tarrl', 'TARRL', 'www.tarrl.org'],
].map(([siteId, name, hostname, active = true]) => ({ siteId, name, hostname, active }));

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
