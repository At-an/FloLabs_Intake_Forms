// Creates a copyable email draft; it never sends email.
//   npm run make-email-draft -- <applicationId> <contacted|masterclass> <https-forms-origin>
import { getEnv } from '../src/server/env.ts';
import { createHrEmailDraftForApplication, HrEmailWorkflowError } from '../src/server/forms/hr-email-workflow.ts';
import { TwentyError, createTwentyClient } from '../src/server/twenty/client.ts';

const [applicationId, stageArg, formsBaseUrl] = process.argv.slice(2);
const stages = ['contacted', 'masterclass'] as const;
const stage = stages.find((candidate) => candidate === stageArg);

if (!applicationId || !stage || !formsBaseUrl) {
  console.error('Usage: npm run make-email-draft -- <applicationId> <contacted|masterclass> <https-forms-origin>');
  process.exit(1);
}

const env = getEnv();
const secret = env.LINK_TOKEN_SECRET;
if (!secret) {
  console.error('LINK_TOKEN_SECRET is missing from the configured environment.');
  process.exit(1);
}

const twenty = createTwentyClient({ baseUrl: env.TWENTY_BASE_URL, apiKey: env.TWENTY_API_KEY });

try {
  const draft = await createHrEmailDraftForApplication({ applicationId, stage, formsBaseUrl, secret }, { twenty });
  console.log(`To: ${draft.to}\nSubject: ${draft.subject}\n\n${draft.body}`);
  console.error('Draft only. No email has been sent.');
} catch (error) {
  if (error instanceof TwentyError) {
    console.error(`Twenty lookup failed (${error.code}). No email draft was created.`);
    process.exit(1);
  }
  if (error instanceof HrEmailWorkflowError) {
    console.error(`${error.message} No email draft was created.`);
    process.exit(1);
  }
  if (error instanceof Error) {
    console.error(`${error.message} No email draft was created.`);
    process.exit(1);
  }
  throw error;
}
