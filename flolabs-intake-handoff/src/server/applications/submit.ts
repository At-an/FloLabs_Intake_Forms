import 'server-only';
import type { ApplicationFormData } from '@/shared/forms/application';
import type { Logger } from '../logger';
import type { TwentyClient } from '../twenty/client';
import { fillEmptyPatch, toApplicationInput, toPersonInput, type SiteResolution } from './mapping';

export type SubmitResult = { applicationId: string; duplicate: boolean };

export type SubmitDeps = {
  twenty: Pick<
    TwentyClient,
    'findApplicationBySubmissionKey' | 'findSiteByKey' | 'findPersonByEmail' | 'createPerson' | 'updatePerson' | 'createApplication'
  >;
  logger: Logger;
  now?: () => Date;
};

const SITE_KEY = /^[a-z0-9_]{1,64}$/;
const MAX_KEY_RECEIVED = 64;

/**
 * Reads `?site=` (approved 2026-10-24): missing -> Site empty, status MISSING; unknown -> Site empty,
 * status UNKNOWN; inactive -> linked to that Site, status INACTIVE; active -> linked, status KNOWN.
 * The key as received is kept (trimmed, max 64 characters) so HR can see what the link carried.
 */
async function resolveSite(twenty: SubmitDeps['twenty'], siteKey: string | undefined): Promise<SiteResolution> {
  const keyReceived = siteKey?.trim().slice(0, MAX_KEY_RECEIVED) || undefined;
  if (!keyReceived) return { status: 'MISSING' };
  const site = SITE_KEY.test(keyReceived) ? await twenty.findSiteByKey(keyReceived) : null;
  if (!site) return { status: 'UNKNOWN', keyReceived };
  return { status: site.active ? 'KNOWN' : 'INACTIVE', siteId: site.id, keyReceived };
}

/**
 * Exactly one Application per submission (CLAUDE.md section 6). A repeated submissionKey
 * returns the original Application without writing anything (rule 6).
 */
export async function submitApplication(
  data: ApplicationFormData,
  siteKey: string | undefined,
  { twenty, logger, now = () => new Date() }: SubmitDeps,
): Promise<SubmitResult> {
  const existing = await twenty.findApplicationBySubmissionKey(data.submissionKey);
  if (existing) {
    logger.info('application.duplicate', { applicationId: existing.id });
    return { applicationId: existing.id, duplicate: true };
  }

  const site = await resolveSite(twenty, siteKey);
  if (site.status !== 'KNOWN') logger.warn('application.site_not_known', { code: `SITE_${site.status}` });
  const incoming = toPersonInput(data);

  let personId: string;
  const person = await twenty.findPersonByEmail(data.email);
  if (person) {
    personId = person.id;
    const patch = fillEmptyPatch(person, incoming);
    if (patch) await twenty.updatePerson(person.id, patch);
    logger.info('person.matched', { personId, code: patch ? 'FILLED_EMPTY_FIELDS' : 'NOTHING_TO_FILL' });
  } else {
    personId = (await twenty.createPerson(incoming)).id;
    logger.info('person.created', { personId });
  }

  const submittedAt = now().toISOString();
  const { id: applicationId } = await twenty.createApplication(
    toApplicationInput(data, { personId, site, submittedAt }),
  );
  logger.info('application.created', { applicationId, personId, siteId: site.siteId, code: `SITE_${site.status}` });
  return { applicationId, duplicate: false };
}
