import { describe, expect, it } from 'vitest';
import { captureLogger, fakeTwenty } from '../applications/fake-twenty';
import { createRateLimiter } from '../rate-limit';
import type { VerifyHuman } from '../turnstile';
import { TwentyError } from '../twenty/client';
import { createLinkToken, type LinkFormType } from './link-tokens';
import { createLinkFormHandler } from './submit-link-form';

const SECRET = 'test-secret-'.padEnd(48, 'x');
const NOW = new Date('2026-10-24T10:00:00.000Z');
const APP = '00000000-0000-4000-8000-0000000000a1';
const KEY = '3f2b8c1e-9a4d-4e7f-8b2a-1c5d6e7f8a9b';
const KEY_2 = '4a3c9d2f-0b5e-4f80-9c3b-2d6e7f8a9b0c';
const APPLICANT = { id: '00000000-0000-4000-8000-0000000000b1', name: { firstName: 'Jane', lastName: 'Doe' }, emails: { primaryEmail: 'jane.doe@example.com' } };

const FORM_1_ANSWERS = {
  G4: 'I love designing for people.',
  G5: 'Ship a real product.',
  G6: 'BSc Design',
  G7: 'Two app redesigns.',
  G8: 12,
  G9: 'MONTHS_6_TO_12',
  G10: [],
  G11: true,
  G12: false,
  G13: '',
  DE1: ['https://janedoe.design'],
  DE2: 'Checkout flow of my bank app.',
  DE3: 'Interviews, sketches, prototypes.',
  C1: 'The research part; unsure about hours.',
};

const reference = (email: string) => ({
  fullName: 'Ada Lovelace',
  title: 'Professor',
  organization: 'University of Example',
  relationship: 'Thesis supervisor',
  email,
  phone: { country: 'GB', number: '020 7946 0958' },
  knownDuration: 'YEARS_1_TO_2',
});

const FORM_3_BODY = {
  answers: { M1: 'Python; public speaking.', M2: true, M3: 'NEED_TO_DISCUSS', M4: '', M5: true },
  references: { R1: reference('ada@example.com'), R2: { ...reference('alan@example.com'), fullName: 'Alan Turing', phone: { country: '', number: '' } } },
};

const post = (form: string, payload: unknown) =>
  new Request(`http://localhost/api/forms/${form}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });

function setup(formType: LinkFormType, options: { verifyHuman?: VerifyHuman; appLimit?: number; programs?: string[]; used?: boolean } = {}) {
  const fake = fakeTwenty({
    applications: [{ id: APP, submissionKey: 'k', positionAppliedFor: options.programs ?? ['UI_UX_DESIGN_INTERN'], person: APPLICANT }],
    formSubmissions: options.used ? [{ id: '00000000-0000-4000-8000-0000000000f1', applicationId: APP, formType }] : [],
  });
  const { logger, lines } = captureLogger();
  const handle = createLinkFormHandler(formType, {
    twenty: fake.twenty,
    logger,
    now: () => NOW,
    verifyHuman: options.verifyHuman ?? (async () => ({ ok: true })),
    ipLimiter: createRateLimiter({ limit: 100, windowMs: 60_000 }),
    emailLimiter: createRateLimiter({ limit: options.appLimit ?? 100, windowMs: 60_000 }),
    secret: SECRET,
  });
  const token = createLinkToken({ applicationId: APP, formType }, SECRET);
  const body = (extra: object) => ({ token, submissionKey: KEY, turnstileToken: 'XXXX.DUMMY.TOKEN.XXXX', ...extra });
  return { handle, fake, lines, token, body };
}

describe('POST /api/forms/contacted (Form 1, T12)', () => {
  it('creates one Form Submission with answers, summary, tracks and typed fields', async () => {
    const { handle, fake, body } = setup('CONTACTED');
    const res = await handle(post('contacted', body({ answers: FORM_1_ANSWERS })));
    expect(res.status).toBe(201);
    expect(await res.json()).toEqual({ formSubmissionId: expect.any(String) });

    const [created] = fake.calls.createFormSubmission;
    expect(created).toMatchObject({
      name: 'Form 1 (Contacted) - Jane Doe',
      formType: 'CONTACTED',
      tracks: ['DESIGN_TECHNICAL_COMMUNICATION'],
      formVersion: 'contacted-v1',
      submittedAt: NOW.toISOString(),
      submissionKey: KEY,
      hoursPerWeek: 12,
      commitmentDuration: 'MONTHS_6_TO_12',
      remoteOk: true,
      canAttendMeetings: false,
      applicationId: APP,
    });
    // Empty optional answers are not stored; answers are keyed by question id.
    expect(Object.keys(created!.answers).sort()).toEqual(['C1', 'DE1', 'DE2', 'DE3', 'G11', 'G12', 'G4', 'G5', 'G6', 'G7', 'G8', 'G9']);
    expect(created!.answersSummary.markdown).toContain('## Design & Technical Communication\n\n### UI/UX Design Intern');
    expect(created!.answersSummary.markdown).toContain('**How many hours per week can you realistically commit?**\n12');
  });

  it('requires only the questions of the applicant’s own programs', async () => {
    const { handle, body } = setup('CONTACTED', { programs: ['UI_UX_DESIGN_INTERN', 'FINANCE_INTERN'] });
    const res = await handle(post('contacted', body({ answers: FORM_1_ANSWERS })));
    expect(res.status).toBe(400);
    const fields = (await res.json()).error.fields;
    expect(Object.keys(fields).sort()).toEqual(['answers.BU1', 'answers.BU2', 'answers.FI1', 'answers.FI2', 'answers.FI3']);
  });

  it('returns field errors for invalid answers', async () => {
    const { handle, fake, body } = setup('CONTACTED');
    const res = await handle(post('contacted', body({ answers: { ...FORM_1_ANSWERS, G4: '', G8: 41 } })));
    expect(res.status).toBe(400);
    expect((await res.json()).error.fields).toEqual({ 'answers.G8': 'Enter a number from 1 to 40.', 'answers.G4': 'Please answer this question.' });
    expect(fake.calls.createFormSubmission).toEqual([]);
  });

  it('returns the original Form Submission for a retry with the same submissionKey', async () => {
    const { handle, fake, body } = setup('CONTACTED');
    const first = await (await handle(post('contacted', body({ answers: FORM_1_ANSWERS })))).json();
    const retry = await handle(post('contacted', body({ answers: FORM_1_ANSWERS })));
    expect(retry.status).toBe(200);
    expect(await retry.json()).toEqual(first);
    expect(fake.calls.createFormSubmission).toHaveLength(1);
  });

  it('refuses a second submission of a used link with 409', async () => {
    const { handle, fake, body } = setup('CONTACTED', { used: true });
    const res = await handle(post('contacted', body({ answers: FORM_1_ANSWERS })));
    expect(res.status).toBe(409);
    expect((await res.json()).error.code).toBe('ALREADY_SUBMITTED');
    expect(fake.calls.createFormSubmission).toEqual([]);
  });

  it('lets only one of two concurrent submissions with different keys through', async () => {
    const { handle, fake, body } = setup('CONTACTED');
    const [a, b] = await Promise.all([
      handle(post('contacted', body({ answers: FORM_1_ANSWERS }))),
      handle(post('contacted', body({ answers: FORM_1_ANSWERS, submissionKey: KEY_2 }))),
    ]);
    expect([a.status, b.status].sort()).toEqual([201, 409]);
    expect(fake.calls.createFormSubmission).toHaveLength(1);
  });

  it('checks the link and Turnstile before any Twenty call', async () => {
    let twentyCalls = 0;
    const counting = (verifyHuman?: VerifyHuman) => {
      const ctx = setup('CONTACTED', { verifyHuman });
      for (const [name, fn] of Object.entries(ctx.fake.twenty)) {
        (ctx.fake.twenty as Record<string, unknown>)[name] = async (...args: unknown[]) => {
          twentyCalls++;
          return (fn as (...a: unknown[]) => unknown)(...args);
        };
      }
      return ctx;
    };

    const tampered = counting();
    const res1 = await tampered.handle(post('contacted', tampered.body({ answers: FORM_1_ANSWERS, token: `${tampered.token}x` })));
    expect(res1.status).toBe(403);
    expect((await res1.json()).error.code).toBe('LINK_INVALID');

    const wrongForm = counting();
    const form2Token = createLinkToken({ applicationId: APP, formType: 'BEFORE_MEETING' }, SECRET);
    expect((await wrongForm.handle(post('contacted', wrongForm.body({ answers: FORM_1_ANSWERS, token: form2Token })))).status).toBe(403);

    const expired = counting();
    const oldToken = createLinkToken({ applicationId: APP, formType: 'CONTACTED' }, SECRET, new Date(Date.now() - 22 * 86_400_000));
    const res2 = await expired.handle(post('contacted', expired.body({ answers: FORM_1_ANSWERS, token: oldToken })));
    expect(res2.status).toBe(403);
    expect(await res2.json()).toEqual({
      error: {
        code: 'LINK_EXPIRED',
        message: "This link has expired. Links are valid for 21 days. Please write to hr@flolabsinnovations.com and we'll send you a new one.",
      },
    });

    const bot = counting(async () => ({ ok: false, code: 'TURNSTILE_FAILED' }));
    const res3 = await bot.handle(post('contacted', bot.body({ answers: FORM_1_ANSWERS })));
    expect(res3.status).toBe(403);
    expect((await res3.json()).error.code).toBe('BOT_CHECK_FAILED');

    expect(twentyCalls).toBe(0);
  });

  it('limits submissions per Application', async () => {
    const { handle, body } = setup('CONTACTED', { appLimit: 1, used: true });
    expect((await handle(post('contacted', body({ answers: FORM_1_ANSWERS })))).status).toBe(409);
    const limited = await handle(post('contacted', body({ answers: FORM_1_ANSWERS })));
    expect(limited.status).toBe(429);
    expect(limited.headers.get('Retry-After')).toBeTruthy();
  });

  it('logs ids and codes only, never answers or emails', async () => {
    const { handle, lines, body } = setup('CONTACTED');
    await handle(post('contacted', body({ answers: FORM_1_ANSWERS })));
    const log = lines.join('\n');
    expect(log).toContain('form_submission.contacted.created');
    expect(log).not.toMatch(/designing|jane|Jane|example\.com/);
  });

  it('maps a Twenty failure to the generic 502', async () => {
    const { handle, fake, body } = setup('CONTACTED');
    fake.twenty.createFormSubmission = async () => {
      throw new TwentyError('twenty.createFormSubmission', 200, 'FORBIDDEN');
    };
    const res = await handle(post('contacted', body({ answers: FORM_1_ANSWERS })));
    expect(res.status).toBe(502);
    expect((await res.json()).error.code).toBe('UPSTREAM_UNAVAILABLE');
  });
});

describe('POST /api/forms/before-meeting (Form 2, T13)', () => {
  const answers = { B1: true, DE1: 'The onboarding.', DE2: 'Search results.', DE3: 'Their goals.' };

  it('stores stillInterested and requires the questions text box for "Yes but I have questions"', async () => {
    const { handle, fake, body } = setup('BEFORE_MEETING');
    const missing = await handle(post('before-meeting', body({ answers: { ...answers, BC1: 'YES_WITH_QUESTIONS' } })));
    expect((await missing.json()).error.fields).toEqual({ 'answers.BC1b': 'Please answer this question.' });

    const res = await handle(post('before-meeting', body({ answers: { ...answers, BC1: 'YES_WITH_QUESTIONS', BC1b: 'When does it start?' } })));
    expect(res.status).toBe(201);
    expect(fake.calls.createFormSubmission[0]).toMatchObject({
      name: 'Form 2 (Before Meeting) - Jane Doe',
      formType: 'BEFORE_MEETING',
      formVersion: 'before-meeting-v1',
      stillInterested: 'YES_WITH_QUESTIONS',
      answers: { ...answers, BC1: 'YES_WITH_QUESTIONS', BC1b: 'When does it start?' },
    });
  });

  it('gives an AI-track applicant the track-wide questions only', async () => {
    const { handle, body } = setup('BEFORE_MEETING', { programs: ['AI_AGI_INTERN', 'BACKEND_DEVELOPER_INTERN'] });
    const res = await handle(post('before-meeting', body({ answers: { B1: false, BC1: 'NO' } })));
    expect(Object.keys((await res.json()).error.fields).sort()).toEqual(['answers.AI1', 'answers.AI2']);
  });
});

describe('POST /api/forms/masterclass (Form 3, T14)', () => {
  it('creates the two References first, then the Form Submission with typed fields', async () => {
    const { handle, fake, body } = setup('MASTERCLASS');
    const res = await handle(post('masterclass', body(FORM_3_BODY)));
    expect(res.status).toBe(201);
    expect(fake.calls.order).toEqual(['createReference', 'createReference', 'createFormSubmission']);
    expect(fake.calls.createReference).toEqual([
      {
        name: 'Ada Lovelace',
        title: 'Professor',
        organization: 'University of Example',
        relationship: 'Thesis supervisor',
        email: { primaryEmail: 'ada@example.com', additionalEmails: [] },
        phone: { primaryPhoneNumber: '2079460958', primaryPhoneCountryCode: 'GB', primaryPhoneCallingCode: '+44', additionalPhones: [] },
        knownDuration: 'YEARS_1_TO_2',
        applicationId: APP,
      },
      expect.not.objectContaining({ phone: expect.anything() }),
    ]);
    const [created] = fake.calls.createFormSubmission;
    expect(created).toMatchObject({
      formType: 'MASTERCLASS',
      formVersion: 'masterclass-v1',
      tracks: ['DESIGN_TECHNICAL_COMMUNICATION'],
      continueToInterview: true,
      canMeetCommitment: 'NEED_TO_DISCUSS',
      referencesContactAllowed: true,
    });
    expect(created!.answers).toMatchObject({ references: { R1: { email: 'ada@example.com' }, R2: { email: 'alan@example.com' } } });
    expect(created!.answersSummary.markdown).toContain('## References\n\n### Reference 1');
  });

  it('refuses the applicant’s own email and two references with the same email', async () => {
    const { handle, body } = setup('MASTERCLASS');
    const own = await handle(post('masterclass', body({ ...FORM_3_BODY, references: { ...FORM_3_BODY.references, R1: reference('Jane.Doe@example.com') } })));
    expect((await own.json()).error.fields).toEqual({ 'references.R1.email': "Enter your reference's email address, not your own." });
    const same = await handle(post('masterclass', body({ ...FORM_3_BODY, references: { R1: reference('ada@example.com'), R2: reference('ADA@example.com') } })));
    expect((await same.json()).error.fields).toEqual({ 'references.R2.email': 'Each reference needs a different email address.' });
  });

  it('requires an explanation when references may not be contacted', async () => {
    const { handle, body } = setup('MASTERCLASS');
    const res = await handle(post('masterclass', body({ ...FORM_3_BODY, answers: { ...FORM_3_BODY.answers, M5: false } })));
    expect((await res.json()).error.fields).toEqual({ 'answers.M5b': 'Please answer this question.' });
  });

  it('reuses the References saved by a failed attempt, so a retry creates no duplicates', async () => {
    const { handle, fake, body } = setup('MASTERCLASS');
    const create = fake.twenty.createFormSubmission;
    fake.twenty.createFormSubmission = async () => {
      throw new TwentyError('twenty.createFormSubmission', 0, 'TIMEOUT');
    };
    expect((await handle(post('masterclass', body(FORM_3_BODY)))).status).toBe(502);
    fake.twenty.createFormSubmission = create;
    expect((await handle(post('masterclass', body(FORM_3_BODY)))).status).toBe(201);
    expect(fake.calls.createReference).toHaveLength(2);
    expect(fake.references).toHaveLength(2);
  });
});
