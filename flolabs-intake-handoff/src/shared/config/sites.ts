// The FloLabs websites (canonical registry from the project lead, 2026-10-26): the one list for
// the Site records in Twenty (scripts/t2-sites.mjs) and for which websites may show the embedded
// forms (CSP frame-ancestors, next.config.ts). Whether a site is active is kept on its Site record
// in Twenty; submissions are accepted only from a known, active Site (src/server/sites.ts).
// Only the www origins are listed: a bare domain (e.g. https://flolabsinnovations.com) that shows
// pages without redirecting to www needs the project lead's approval before it is added.

export const SITES = [
  { siteId: 'athletic_performance_intelligence', name: 'Athletic Performance Intelligence', origin: 'https://www.athleticperformanceintelligence.com' },
  { siteId: 'bootcamp_university', name: 'Bootcamp University', origin: 'https://www.bootcampuniversity.org' },
  { siteId: 'caipo', name: 'CAIPO', origin: 'https://www.caipo.ai' },
  { siteId: 'cosmos_intelligence', name: 'Cosmos Intelligence', origin: 'https://www.cosmosintelligence.org' },
  { siteId: 'flo_studios', name: 'Flo Studios', origin: 'https://www.flostudios.ai' },
  { siteId: 'flobrain', name: 'FloBrain', origin: 'https://www.flobrain.ai' },
  { siteId: 'flolabs_innovations_group', name: 'FloLabs Innovations Group', origin: 'https://www.flolabsinnovations.com' },
  { siteId: 'flolabs_international', name: 'FloLabs International', origin: 'https://www.flolabs.international' },
  { siteId: 'flomad', name: 'Flomad', origin: 'https://www.flomad.com' },
  { siteId: 'flomad_travel', name: 'Flomad Travel', origin: 'https://www.flomadtravel.com' },
  { siteId: 'hephaestus_international', name: 'Hephaestus International', origin: 'https://www.hephaestus.international' },
  { siteId: 'legal_ethics_ventures_institute', name: 'Legal Ethics Ventures Institute', origin: 'https://www.legalethicsventuresinstitute.com' },
  { siteId: 'moodchanger', name: 'Moodchanger', origin: 'https://www.moodchanger.ai' },
  // "robocollective", not "robocollective_ai" (project lead's canonical list).
  { siteId: 'robocollective', name: 'Robocollective', origin: 'https://www.robocollective.ai' },
  { siteId: 'space_ventures_institute', name: 'Space Ventures Institute', origin: 'https://www.spaceventuresinstitute.com' },
  { siteId: 'tarrl', name: 'TARRL', origin: 'https://www.tarrl.org' },
] as const;

/** CSP frame-ancestors value for /embed pages; development also allows local test pages. */
export function embedFrameAncestors(development: boolean): string {
  const sources: string[] = SITES.map((site) => site.origin);
  if (development) sources.unshift("'self'", 'http://localhost:*', 'http://127.0.0.1:*');
  return sources.join(' ');
}
