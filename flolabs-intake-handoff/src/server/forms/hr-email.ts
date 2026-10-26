import 'server-only';
import { PROGRAMS } from '@/shared/config/programs';
import { newsletterSchema } from '@/shared/forms/embed-forms';
import type { ApplicationForLink } from '../twenty/types';
import { formLinkUrl } from './link-tokens';

export type HrEmailStage = 'contacted' | 'masterclass';

export type HrEmailDraft = {
  to: string;
  subject: string;
  body: string;
};

export type HrEmailDraftInput = {
  application: ApplicationForLink;
  stage: HrEmailStage;
  formsBaseUrl: string;
  secret: string;
};

export function createHrEmailDraft({ application, stage, formsBaseUrl, secret }: HrEmailDraftInput): HrEmailDraft {
  const recipient = application.person?.emails?.primaryEmail?.trim();
  if (!recipient || !newsletterSchema.shape.email.safeParse(recipient).success) {
    throw new Error('The linked applicant is missing a valid primary email address.');
  }

  const programNames = application.positionAppliedFor.flatMap((value) => {
    const program = PROGRAMS.find((candidate) => candidate.value === value);
    return program ? [program.label] : [];
  });
  if (!programNames.length || programNames.length !== application.positionAppliedFor.length) {
    throw new Error('The Application is missing valid program information.');
  }

  const base = new URL(formsBaseUrl);
  if (base.protocol !== 'https:' || base.username || base.password || base.pathname !== '/' || base.search || base.hash) {
    throw new Error('The forms base URL must be an HTTPS origin without a path or query.');
  }
  if (secret.length < 32) throw new Error('LINK_TOKEN_SECRET must be at least 32 characters.');

  const firstName = application.person?.name?.firstName?.trim() || 'there';
  const programList = programNames.join(', ');

  if (stage === 'contacted') {
    const form1 = formLinkUrl(base.origin, { applicationId: application.id, formType: 'CONTACTED' }, secret);
    const form2 = formLinkUrl(base.origin, { applicationId: application.id, formType: 'BEFORE_MEETING' }, secret);
    return {
      to: recipient,
      subject: 'Your FloLabs application: next steps',
      body: [
        `Hello ${firstName},`,
        '',
        `Thank you for applying to ${programList}. Before we meet, please complete these two short forms:`,
        '',
        `Tell Us More About You: ${form1}`,
        '',
        `Getting Ready for Your Orientation: ${form2}`,
        '',
        'Each link is personal and works once. Your answers are saved on your device as you type, so you can come back to them in the same browser.',
        '',
        'Best regards, FloLabs HR',
      ].join('\n'),
    };
  }

  const form3 = formLinkUrl(base.origin, { applicationId: application.id, formType: 'MASTERCLASS' }, secret);
  return {
    to: recipient,
    subject: 'FloLabs: final steps before your interview',
    body: [
      `Hello ${firstName},`,
      '',
      'Thank you for attending the masterclass. Please complete this last form, which includes two professional or academic references:',
      '',
      `Final Steps Before Your Interview: ${form3}`,
      '',
      'The link is personal and works once.',
      '',
      'Best regards, FloLabs HR',
    ].join('\n'),
  };
}
