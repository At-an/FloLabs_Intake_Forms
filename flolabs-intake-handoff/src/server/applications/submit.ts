import 'server-only';
import type { ApplicationFormData } from '@/shared/forms/application';
import type { Logger } from '../logger';
import type { TwentyClient } from '../twenty/client';
import { FIELD_IDS } from '../twenty/fields';
import type { CheckedCv } from './cv';
import { upsertPersonByEmail } from '../people/person';
import { toApplicationInput, toPersonData, type SiteResolution } from './mapping';

export type SubmitResult = { applicationId: string; duplicate: boolean };

export type SubmitDeps = {
  twenty: Pick<
    TwentyClient,
    | 'findApplicationBySubmissionKey'
    | 'findSiteByKey'
    | 'findPersonByEmail'
    | 'createPerson'
    | 'updatePerson'
    | 'uploadFile'
    | 'createApplication'
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
 * returns the original Application without writing anything (rule 6). The CV is uploaded
 * before any record is written, so a failed upload creates no Person or Application.
 */
export async function submitApplication(
  data: ApplicationFormData,
  siteKey: string | undefined,
  cv: CheckedCv,
  { twenty, logger, now = () => new Date() }: SubmitDeps,
): Promise<SubmitResult> {
  const existing = await twenty.findApplicationBySubmissionKey(data.submissionKey);
  if (existing) {
    logger.info('application.duplicate', { applicationId: existing.id });
    return { applicationId: existing.id, duplicate: true };
  }

  const site = await resolveSite(twenty, siteKey);
  if (site.status !== 'KNOWN') logger.warn('application.site_not_known', { code: `SITE_${site.status}` });

  const { fileId } = await twenty.uploadFile({
    filename: cv.label,
    bytes: cv.bytes,
    fieldMetadataId: FIELD_IDS.applicationCvResume,
  });
  logger.info('cv.uploaded', { recordId: fileId, code: `CV_${cv.kind.toUpperCase()}` });

  const submittedAt = now().toISOString();
  const { personId } = await upsertPersonByEmail(
    toPersonData(data, { submittedAt, consentSiteKey: site.status === 'KNOWN' ? site.keyReceived : undefined }),
    { twenty, logger },
  );

  const { id: applicationId } = await twenty.createApplication(
    toApplicationInput(data, { personId, site, submittedAt, cv: { fileId, label: cv.label } }),
  );
  logger.info('application.created', { applicationId, personId, siteId: site.siteId, code: `SITE_${site.status}` });
  return { applicationId, duplicate: false };
}
