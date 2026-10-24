import { beforeAll, describe, expect, it } from 'vitest';
import { answerQuestions, type AnswerQuestion } from '@/shared/forms/engine';
import { buildLinkForm } from '@/shared/forms/link-forms';
import { createInquiriesHandler } from '../inquiries/handler';
import { logger } from '../logger';
import { createRateLimiter } from '../rate-limit';
import { createTwentyClient, type TwentyClient } from '../twenty/client';
import { createLinkToken, type LinkFormType } from './link-tokens';
import { openFormLink } from './open-link';
import { createLinkFormHandler } from './submit-link-form';

// WRITES to the live Twenty (T9 Contact Us, T12-T14 Forms 1-3). Run only on purpose, once the
// API key's role may read/create Inquiries, Form Submissions and References:
//   npm run test:live-write
// It uses the test Person and the first test Application (kept until T16), so it uses up that
// Application's Form 1-3 links. Turnstile is not called (the handlers get a pass-through check);
// everything after it is the real code path. Records carry the approved names, never placeholders.
// One-shot per Application: a second run fails on the used links. Run one form with
//   npm run test:live-write -- -t MASTERCLASS

const live = Boolean(process.env.LIVE_WRITE && process.env.TWENTY_BASE_URL && process.env.TWENTY_API_KEY && process.env.LINK_TOKEN_SECRET);

const TEST_EMAIL = 'zoom+t5test@flomadlabs.com';
const TEST_APPLICATION = '7ca6ccf2-2aa0-478b-a76d-c655a6f2037f';

const guards = () => ({
  logger,
  verifyHuman: async () => ({ ok: true as const }),
  ipLimiter: createRateLimiter({ limit: 100, windowMs: 60_000 }),
  emailLimiter: createRateLimiter({ limit: 100, windowMs: 60_000 }),
});

const post = (path: string, body: unknown) =>
  new Request(`http://localhost/api/${path}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });

/** A valid answer for every question of the form (the first option, a mid-range number, ...). */
function sampleAnswers(questions: readonly AnswerQuestion[]): Record<string, unknown> {
  const answers: Record<string, unknown> = {};
  for (const q of questions) {
    if (q.showIf) continue; // conditional follow-ups stay hidden with the answers below
    switch (q.kind) {
      case 'text':
      case 'textarea':
        answers[q.id] = `Live test answer to ${q.id}.`;
        break;
      case 'number':
        answers[q.id] = 10;
        break;
      case 'select':
      case 'radio':
        answers[q.id] = q.options[0]!.value;
        break;
      case 'multiselect':
        answers[q.id] = [q.options[0]!.value];
        break;
      case 'yesno':
        answers[q.id] = true;
        break;
      case 'links':
        answers[q.id] = ['https://flolabsinnovations.com'];
        break;
    }
  }
  return answers;
}

/** Test-only read of the stored record, to confirm Twenty kept the summary and typed fields. */
async function readFormSubmission(id: string) {
  const res = await fetch(`${process.env.TWENTY_BASE_URL!.replace(/\/+$/, '')}/graphql`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${process.env.TWENTY_API_KEY}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      query: `query($id: UUID!) { formSubmissions(filter: { id: { eq: $id } }, first: 1) { edges { node {
        id name formType tracks formVersion answers answersSummary { markdown } hoursPerWeek stillInterested canMeetCommitment applicationId
      } } } }`,
      variables: { id },
    }),
  });
  return (await res.json()).data.formSubmissions.edges[0]?.node;
}

// Each form makes several Twenty round trips; 5 s (the default) is too short over the network.
describe.skipIf(!live)('Contact Us and Forms 1-3 (live, WRITES records)', { timeout: 30_000 }, () => {
  let twenty: TwentyClient;
  beforeAll(() => {
    twenty = createTwentyClient({ baseUrl: process.env.TWENTY_BASE_URL!, apiKey: process.env.TWENTY_API_KEY! });
  });

  it('the API key may read Inquiries, Form Submissions and References', async () => {
    await expect(twenty.findInquiryBySubmissionKey('00000000-0000-4000-8000-000000000000')).resolves.toBeNull();
    await expect(twenty.findFormSubmissionBySubmissionKey('00000000-0000-4000-8000-000000000000')).resolves.toBeNull();
    await expect(twenty.findReferenceFor(TEST_APPLICATION, 'nobody@example.invalid')).resolves.toBeNull();
  });

  it('T9 Contact Us: creates one Inquiry, and a retry returns it', async () => {
    const handle = createInquiriesHandler({ ...guards(), twenty });
    const body = {
      submissionKey: crypto.randomUUID(),
      firstName: 'Atankeu',
      lastName: 'Natanahel',
      email: TEST_EMAIL,
      subject: 'Contact Us live test',
      message: 'Live test of the Contact Us form (T9).',
      site: 'flolabs_international',
      turnstileToken: 'live-test',
    };
    const first = await handle(post('inquiries', body));
    expect(first.status).toBe(201);
    const { inquiryId } = await first.json();
    const retry = await handle(post('inquiries', body));
    expect(retry.status).toBe(200);
    expect(await retry.json()).toEqual({ inquiryId });
  });

  it.each<[LinkFormType, string]>([
    ['CONTACTED', 'contacted'],
    ['BEFORE_MEETING', 'before-meeting'],
    ['MASTERCLASS', 'masterclass'],
  ])('%s: the link opens, one Form Submission is saved, then the link is used', async (formType, path) => {
    const secret = process.env.LINK_TOKEN_SECRET!;
    const token = createLinkToken({ applicationId: TEST_APPLICATION, formType }, secret);
    const opened = await openFormLink(token, formType, { twenty, logger, secret });
    expect(opened).toMatchObject({ ok: true });
    const application = (opened as { ok: true; application: { positionAppliedFor: string[] } }).application;

    const form = buildLinkForm(formType, application.positionAppliedFor);
    const answers = sampleAnswers(answerQuestions(form));
    const references =
      formType === 'MASTERCLASS'
        ? {
            R1: { fullName: 'Atankeu Natanahel', title: 'Team Lead', organization: 'FloLabs', relationship: 'Live test reference', email: 'zoom+ref1@flomadlabs.com', phone: { country: 'US', number: '+1 202 555 0143' }, knownDuration: 'YEARS_1_TO_2' },
            R2: { fullName: 'Atankeu Natanahel', title: 'Mentor', organization: 'FloLabs', relationship: 'Live test reference', email: 'zoom+ref2@flomadlabs.com', phone: { country: '', number: '' }, knownDuration: 'MONTHS_6_TO_12' },
          }
        : undefined;
    const handle = createLinkFormHandler(formType, { ...guards(), twenty, secret });
    const body = { token, submissionKey: crypto.randomUUID(), turnstileToken: 'live-test', answers, ...(references && { references }) };

    const created = await handle(post(`forms/${path}`, body));
    expect(created.status, JSON.stringify(await created.clone().json())).toBe(201);
    const { formSubmissionId } = await created.json();

    const retry = await handle(post(`forms/${path}`, body));
    expect(retry.status).toBe(200);
    expect(await retry.json()).toEqual({ formSubmissionId });
    expect((await handle(post(`forms/${path}`, { ...body, submissionKey: crypto.randomUUID() }))).status).toBe(409);
    expect(await openFormLink(token, formType, { twenty, logger, secret })).toEqual({ ok: false, reason: 'USED' });

    const stored = await readFormSubmission(formSubmissionId);
    expect(stored).toMatchObject({ formType, formVersion: form.version, applicationId: TEST_APPLICATION, tracks: expect.arrayContaining([...form.tracks]) });
    expect(stored.answersSummary.markdown).toContain(`## ${form.sections[0]!.title}`);
    if (formType === 'CONTACTED') expect(stored.hoursPerWeek).toBe(10);
    if (formType === 'MASTERCLASS') {
      expect(stored.answers.references.R1.email).toBe('zoom+ref1@flomadlabs.com');
      await expect(twenty.findReferenceFor(TEST_APPLICATION, 'zoom+ref2@flomadlabs.com')).resolves.toMatchObject({ id: expect.any(String) });
    }
  });
});
