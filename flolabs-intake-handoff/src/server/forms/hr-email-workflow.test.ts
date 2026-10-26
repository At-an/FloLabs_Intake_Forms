import { describe, expect, it } from 'vitest';
import type { HrEmailWorkflowDeps } from './hr-email-workflow';
import {
  createHrEmailDraftForApplication,
  createHrEmailDraftWithAssociationForApplication,
  HrEmailWorkflowError,
} from './hr-email-workflow';

const APPLICATION_ID = '7ca6ccf2-2aa0-478b-a76d-c655a6f2037f';
const SECRET = 'test-secret-'.padEnd(48, 'x');
const application = {
  id: APPLICATION_ID,
  positionAppliedFor: ['UI_UX_DESIGN_INTERN'],
  person: {
    id: '503ae559-7e05-42b7-8c79-dc3632633b2f',
    name: { firstName: 'Jane', lastName: 'Doe' },
    emails: { primaryEmail: 'jane.doe@example.com', additionalEmails: [] },
  },
};

function setup(options: { application?: typeof application | null; completedForm?: string } = {}) {
  const lookedUp: string[] = [];
  const checked: string[] = [];
  const deps: HrEmailWorkflowDeps = {
    twenty: {
      findApplicationForLink: async (id) => {
        lookedUp.push(id);
        return options.application === undefined ? application : options.application;
      },
      findFormSubmissionFor: async (id, formType) => {
        checked.push(`${id}:${formType}`);
        return options.completedForm === formType ? { id: '1' } : null;
      },
    },
  };
  return { deps, lookedUp, checked };
}

describe('HR email draft workflow', () => {
  it('looks up the requested Application and checks both contacted forms before drafting', async () => {
    const { deps, lookedUp, checked } = setup();
    const draft = await createHrEmailDraftForApplication(
      {
        applicationId: APPLICATION_ID,
        stage: 'contacted',
        formsBaseUrl: 'https://forms.example.com',
        secret: SECRET,
      },
      deps,
    );

    expect(lookedUp).toEqual([APPLICATION_ID]);
    expect(checked).toEqual([`${APPLICATION_ID}:CONTACTED`, `${APPLICATION_ID}:BEFORE_MEETING`]);
    expect(draft.to).toBe('jane.doe@example.com');
  });

  it('checks only the masterclass form for a Form 3 draft', async () => {
    const { deps, checked } = setup();
    await createHrEmailDraftForApplication(
      {
        applicationId: APPLICATION_ID,
        stage: 'masterclass',
        formsBaseUrl: 'https://forms.example.com',
        secret: SECRET,
      },
      deps,
    );
    expect(checked).toEqual([`${APPLICATION_ID}:MASTERCLASS`]);
  });

  it('returns the CRM association from the same application lookup used to draft', async () => {
    const { deps } = setup();
    const result = await createHrEmailDraftWithAssociationForApplication({
      applicationId: APPLICATION_ID,
      stage: 'contacted',
      formsBaseUrl: 'https://forms.example.com',
      secret: SECRET,
    }, deps);
    expect(result).toMatchObject({
      contactId: application.person.id,
      applicationId: APPLICATION_ID,
      draft: { to: 'jane.doe@example.com' },
    });
  });

  it('refuses a missing Application', async () => {
    const { deps, checked } = setup({ application: null });
    await expect(
      createHrEmailDraftForApplication(
        {
          applicationId: APPLICATION_ID,
          stage: 'contacted',
          formsBaseUrl: 'https://forms.example.com',
          secret: SECRET,
        },
        deps,
      ),
    ).rejects.toMatchObject({ code: 'APPLICATION_NOT_FOUND' } satisfies Partial<HrEmailWorkflowError>);
    expect(checked).toEqual([]);
  });

  it.each(['CONTACTED', 'BEFORE_MEETING'])('refuses to draft if %s was already submitted', async (completedForm) => {
    const { deps } = setup({ completedForm });
    await expect(
      createHrEmailDraftForApplication(
        {
          applicationId: APPLICATION_ID,
          stage: 'contacted',
          formsBaseUrl: 'https://forms.example.com',
          secret: SECRET,
        },
        deps,
      ),
    ).rejects.toThrow(HrEmailWorkflowError);
  });
});
