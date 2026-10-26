import 'server-only';
import { AppError } from './errors';
import type { Logger } from './logger';
import type { TwentyClient } from './twenty/client';
import type { SiteStatus } from './twenty/types';

// Which FloLabs website a submission came from (project lead, 2026-10-26, same rule for every
// form): only a known, active Site is accepted. Everything else is refused before any record
// is written, with a generic message for the visitor and the reason in the server log:
//   active Site   -> KNOWN (accepted)      missing key -> MISSING (refused)
//   unknown key   -> UNKNOWN (refused)     inactive    -> INACTIVE (refused)

export type SiteResolution = {
  status: SiteStatus;
  /** Twenty record id of the Site, for KNOWN and INACTIVE. */
  siteId?: string;
  keyReceived?: string;
};

export type KnownSite = { status: 'KNOWN'; siteId: string; keyReceived: string };

const SITE_KEY = /^[a-z0-9_]{1,64}$/;
const MAX_KEY_RECEIVED = 64;

export async function resolveSite(twenty: Pick<TwentyClient, 'findSiteByKey'>, siteKey: unknown): Promise<SiteResolution> {
  const keyReceived = typeof siteKey === 'string' ? siteKey.trim().slice(0, MAX_KEY_RECEIVED) || undefined : undefined;
  if (!keyReceived) return { status: 'MISSING' };
  const site = SITE_KEY.test(keyReceived) ? await twenty.findSiteByKey(keyReceived) : null;
  if (!site) return { status: 'UNKNOWN', keyReceived };
  return { status: site.active ? 'KNOWN' : 'INACTIVE', siteId: site.id, keyReceived };
}

/** The Site for a submission, or AppError('SITE_NOT_ALLOWED') when it is missing, unknown or inactive. */
export async function requireActiveSite(
  twenty: Pick<TwentyClient, 'findSiteByKey'>,
  siteKey: unknown,
  logger: Logger,
  event: string,
): Promise<KnownSite> {
  const site = await resolveSite(twenty, siteKey);
  if (site.status === 'KNOWN' && site.siteId && site.keyReceived) {
    return { status: 'KNOWN', siteId: site.siteId, keyReceived: site.keyReceived };
  }
  // The Site record id only (inactive); the key itself is not logged, it is visitor input.
  logger.warn(event, { code: `SITE_${site.status}`, siteId: site.siteId });
  throw new AppError('SITE_NOT_ALLOWED');
}
