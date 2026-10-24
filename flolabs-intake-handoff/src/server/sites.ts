import 'server-only';
import type { TwentyClient } from './twenty/client';
import type { SiteStatus } from './twenty/types';

// Which FloLabs website a submission came from (approved 2026-10-24, same rule for every form).
// Forms may run on any HTTPS website, including future ones, so an unknown key is recorded and
// marked instead of refused:
//   active Site   -> linked, KNOWN        missing key -> no Site, MISSING
//   unknown key   -> no Site, UNKNOWN     inactive    -> linked, INACTIVE
// The key as received is kept (trimmed, max 64 characters) so HR can see what the website sent.

export type SiteResolution = {
  status: SiteStatus;
  /** Twenty record id of the Site, for KNOWN and INACTIVE. */
  siteId?: string;
  keyReceived?: string;
};

const SITE_KEY = /^[a-z0-9_]{1,64}$/;
const MAX_KEY_RECEIVED = 64;

export async function resolveSite(twenty: Pick<TwentyClient, 'findSiteByKey'>, siteKey: unknown): Promise<SiteResolution> {
  const keyReceived = typeof siteKey === 'string' ? siteKey.trim().slice(0, MAX_KEY_RECEIVED) || undefined : undefined;
  if (!keyReceived) return { status: 'MISSING' };
  const site = SITE_KEY.test(keyReceived) ? await twenty.findSiteByKey(keyReceived) : null;
  if (!site) return { status: 'UNKNOWN', keyReceived };
  return { status: site.active ? 'KNOWN' : 'INACTIVE', siteId: site.id, keyReceived };
}
