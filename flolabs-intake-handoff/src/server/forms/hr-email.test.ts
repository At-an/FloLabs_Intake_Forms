import { describe, expect, it } from 'vitest';
import { createHrEmailDraft } from './hr-email';
import { verifyLinkToken } from './link-tokens';

const SECRET = 'test-secret-'.padEnd(48, 'x');
const APPLICATION_ID = '7ca6ccf2-2aa0-478b-a76d-c655a6f2037f';
const application = {
  id: APPLICATION_ID,
  positionAppliedFor: ['UI_UX_DESIGN_INTERN', 'FINANCE_INTERN'],
  person: {
    id: '503ae559-7e05-42b7-8c79-dc3632633b2f',
    name: { firstName: 'Jane', lastName: 'Doe' },
    emails: { primaryEmail: 'jane.doe@example.com', additionalEmails: [] },
  },
};

describe('HR email drafts', () => {
  it('composes the Form 1 and Form 2 email using links for the same Application', () => {
    const draft = createHrEmailDraft({
      application,
      stage: 'contacted',
      formsBaseUrl: 'https://forms.example.com',
      secret: SECRET,
    });
    const lines = draft.body.split('\n');
    const form1Url = lines.find((line) => line.startsWith('Tell Us More About You: '))?.split(': ')[1];
    const form2Url = lines.find((line) => line.startsWith('Getting Ready for Your Orientation: '))?.split(': ')[1];
    const form1 = new URL(form1Url!);
    const form2 = new URL(form2Url!);

    expect(draft.to).toBe('jane.doe@example.com');
    expect(draft.subject).toBe('Your FloLabs application: next steps');
    expect(draft.body).toContain('Hello Jane,');
    expect(draft.body).toContain('Thank you for applying to UI/UX Design Intern, Finance Intern.');
    expect(verifyLinkToken(form1.searchParams.get('t'), SECRET, 'CONTACTED')).toEqual({
      ok: true,
      applicationId: APPLICATION_ID,
      formType: 'CONTACTED',
    });
    expect(verifyLinkToken(form2.searchParams.get('t'), SECRET, 'BEFORE_MEETING')).toEqual({
      ok: true,
      applicationId: APPLICATION_ID,
      formType: 'BEFORE_MEETING',
    });
  });

  it('composes the Form 3 email for the same Application', () => {
    const draft = createHrEmailDraft({
      application,
      stage: 'masterclass',
      formsBaseUrl: 'https://forms.example.com',
      secret: SECRET,
    });
    const formUrl = draft.body.match(/Final Steps Before Your Interview: (https:\/\/\S+)/)?.[1];

    expect(draft.subject).toBe('FloLabs: final steps before your interview');
    expect(draft.body).toContain('Hello Jane,');
    expect(verifyLinkToken(new URL(formUrl!).searchParams.get('t'), SECRET, 'MASTERCLASS')).toEqual({
      ok: true,
      applicationId: APPLICATION_ID,
      formType: 'MASTERCLASS',
    });
  });

  it('creates personal links that still expire after 21 days', () => {
    const draft = createHrEmailDraft({
      application,
      stage: 'contacted',
      formsBaseUrl: 'https://forms.example.com',
      secret: SECRET,
    });
    const form1Url = draft.body.split('\n').find((line) => line.startsWith('Tell Us More About You: '))?.split(': ')[1];
    const token = new URL(form1Url!).searchParams.get('t');

    expect(verifyLinkToken(token, SECRET, 'CONTACTED', new Date(Date.now() + 22 * 24 * 60 * 60 * 1000))).toEqual({
      ok: false,
      code: 'EXPIRED',
    });
  });

  it('uses a neutral greeting when the applicant name is missing', () => {
    const draft = createHrEmailDraft({
      application: { ...application, person: { ...application.person, name: null } },
      stage: 'masterclass',
      formsBaseUrl: 'https://forms.example.com',
      secret: SECRET,
    });
    expect(draft.body).toContain('Hello there,');
  });

  it.each([
    ['missing email', { ...application, person: { ...application.person, emails: null } }],
    ['invalid email', { ...application, person: { ...application.person, emails: { primaryEmail: 'jane@' } } }],
    ['missing person', { ...application, person: null }],
    ['missing programs', { ...application, positionAppliedFor: [] }],
    ['unknown program', { ...application, positionAppliedFor: ['UNKNOWN_PROGRAM'] }],
  ])('rejects an Application with %s', (_case, invalidApplication) => {
    expect(() =>
      createHrEmailDraft({
        application: invalidApplication,
        stage: 'contacted',
        formsBaseUrl: 'https://forms.example.com',
        secret: SECRET,
      }),
    ).toThrow();
  });

  it('rejects insecure or malformed forms URLs and weak link secrets', () => {
    expect(() =>
      createHrEmailDraft({ application, stage: 'contacted', formsBaseUrl: 'http://forms.example.com', secret: SECRET }),
    ).toThrow(/HTTPS origin/);
    expect(() =>
      createHrEmailDraft({ application, stage: 'contacted', formsBaseUrl: 'https://forms.example.com/path', secret: SECRET }),
    ).toThrow(/HTTPS origin/);
    expect(() =>
      createHrEmailDraft({ application, stage: 'contacted', formsBaseUrl: 'https://forms.example.com', secret: 'short' }),
    ).toThrow(/at least 32 characters/);
  });
});
