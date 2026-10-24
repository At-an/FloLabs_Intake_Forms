// Websites allowed to embed the Contact Us and Newsletter forms (CSP frame-ancestors).
// Source: the active Site records in Twenty (docs/twenty-schema.md). Inactive Sites (flomad)
// are left out. moodchanger.ai also serves its site without "www", so both are listed.
// The data-site key itself is checked against Twenty on every request.

export const EMBED_HOSTS = [
  'www.athleticperformanceintelligence.com',
  'www.bootcampuniversity.org',
  'www.caipo.ai',
  'www.cosmosintelligence.org',
  'www.flostudios.ai',
  'www.flobrain.ai',
  'www.flolabsinnovations.com',
  'www.flolabs.international',
  'www.flomadtravel.com',
  'www.hephaestus.international',
  'www.legalethicsventuresinstitute.com',
  'www.moodchanger.ai',
  'moodchanger.ai',
  'www.robocollective.ai',
  'www.spaceventuresinstitute.com',
  'www.tarrl.org',
] as const;

/** CSP frame-ancestors value for /embed pages; development also allows local test pages. */
export function embedFrameAncestors(development: boolean): string {
  const sources = EMBED_HOSTS.map((host) => `https://${host}`);
  if (development) sources.unshift("'self'", 'http://localhost:*', 'http://127.0.0.1:*');
  return sources.join(' ');
}
