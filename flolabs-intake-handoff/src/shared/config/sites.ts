// Which websites may show the embedded forms (CSP frame-ancestors), decided 2026-10-24:
// any HTTPS website, so current and future FloLabs websites work without a code change.
// Every submission still passes the bot check and rate limits, and records which website
// it came from (Known / Missing / Unknown / Inactive, see src/server/sites.ts).

/** CSP frame-ancestors value for /embed pages; development also allows local test pages. */
export function embedFrameAncestors(development: boolean): string {
  const sources = ['https:'];
  if (development) sources.unshift("'self'", 'http://localhost:*', 'http://127.0.0.1:*');
  return sources.join(' ');
}
