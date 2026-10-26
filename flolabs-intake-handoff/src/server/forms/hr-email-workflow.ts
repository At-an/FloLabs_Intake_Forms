import 'server-only';
import type { TwentyClient } from '../twenty/client';
import type { ApplicationForLink } from '../twenty/types';
import { createHrEmailDraft, type HrEmailDraft, type HrEmailStage } from './hr-email';
import { LINK_FORM_TYPES } from './link-tokens';

export type HrEmailWorkflowDeps = {
  twenty: Pick<TwentyClient, 'findApplicationForLink' | 'findFormSubmissionFor'>;
};

export class HrEmailWorkflowError extends Error {
  constructor(readonly code: 'APPLICATION_NOT_FOUND' | 'CONTACT_NOT_FOUND' | 'FORM_ALREADY_SUBMITTED', message: string) {
    super(message);
    this.name = 'HrEmailWorkflowError';
  }
}

export async function createHrEmailDraftWithAssociationForApplication(
  input: { applicationId: string; stage: HrEmailStage; formsBaseUrl: string; secret: string },
  { twenty }: HrEmailWorkflowDeps,
): Promise<{ draft: HrEmailDraft; contactId: string; applicationId: string }> {
  const application: ApplicationForLink | null = await twenty.findApplicationForLink(input.applicationId);
  if (!application) {
    throw new HrEmailWorkflowError('APPLICATION_NOT_FOUND', 'No matching Application was found.');
  }

  const formTypes = input.stage === 'contacted' ? ['CONTACTED', 'BEFORE_MEETING'] as const : ['MASTERCLASS'] as const;
  const submissions = await Promise.all(
    formTypes.map((formType) => twenty.findFormSubmissionFor(application.id, formType)),
  );
  const completed = submissions.flatMap((submission, index) => {
    const formType = formTypes[index];
    return submission && formType ? [LINK_FORM_TYPES[formType].label] : [];
  });
  if (completed.length) {
    throw new HrEmailWorkflowError(
      'FORM_ALREADY_SUBMITTED',
      `A form in this email has already been submitted (${completed.join(', ')}).`,
    );
  }

  if (!application.person?.id) {
    throw new HrEmailWorkflowError('CONTACT_NOT_FOUND', 'The Application has no linked CRM contact.');
  }
  return {
    draft: createHrEmailDraft({ application, stage: input.stage, formsBaseUrl: input.formsBaseUrl, secret: input.secret }),
    contactId: application.person.id,
    applicationId: application.id,
  };
}

export async function createHrEmailDraftForApplication(
  input: { applicationId: string; stage: HrEmailStage; formsBaseUrl: string; secret: string },
  deps: HrEmailWorkflowDeps,
): Promise<HrEmailDraft> {
  return (await createHrEmailDraftWithAssociationForApplication(input, deps)).draft;
}
