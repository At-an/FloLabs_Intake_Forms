import { z } from 'zod';
import { HR_EMAIL, LIMITS } from '../config/application';
import { valuesOf } from '../config/options';
import { PROGRAMS } from '../config/programs';
import { SOURCES } from '../config/sources';
import { countryCode, phoneInput } from './phone';

// The one Zod schema for the Application form (CLAUDE.md rule 4), shared by the browser
// (live inline errors) and the server (authoritative check). The CV file is validated
// separately by signature and size (T6c); Turnstile and the site key are checked by the route.

const requiredText = (max: number, message: string) =>
  z.string(message).trim().min(1, message).max(max, `Use ${max} characters or fewer.`);

const optionalText = (max: number) =>
  z
    .string('Enter text here, or leave it empty.')
    .trim()
    .max(max, `Use ${max} characters or fewer.`)
    .optional()
    .transform((value) => value || undefined);

const linkedinField = optionalText(LIMITS.linkedinUrl).transform((value, ctx) => {
  if (!value) return undefined;
  const url = normalizeLinkedin(value);
  if (!url) {
    ctx.addIssue({ code: 'custom', message: 'Enter a LinkedIn profile link (linkedin.com).' });
    return z.NEVER;
  }
  return url;
});

// Runs the cross-field rules unless the fields they read have their own errors.
const unlessInvalid =
  (...fields: string[]) =>
  (payload: { issues: readonly { path?: readonly PropertyKey[] }[] }) =>
    !payload.issues.some((issue) => fields.includes(String(issue.path?.[0])));

function normalizeLinkedin(raw: string): string | null {
  const withScheme = /^https?:\/\//i.test(raw) ? raw : `https://${raw}`;
  try {
    const url = new URL(withScheme);
    const host = url.hostname.toLowerCase();
    if (host !== 'linkedin.com' && !host.endsWith('.linkedin.com')) return null;
    url.protocol = 'https:';
    return url.toString();
  } catch {
    return null;
  }
}

export const applicationSchema = z
  .object({
    submissionKey: z.uuid('This form could not be sent. Please reload the page and try again.'),

    firstName: requiredText(LIMITS.name, 'Enter your first name.'),
    lastName: requiredText(LIMITS.name, 'Enter your last name.'),
    email: z
      .string('Enter your email address.')
      .trim()
      .toLowerCase()
      .min(1, 'Enter your email address.')
      .max(LIMITS.email, 'This email address is too long.')
      .pipe(z.email('Enter a valid email address, like name@example.com.')),

    phone: phoneInput,

    country: countryCode('Choose your country or region.'),
    state: optionalText(LIMITS.state),
    city: requiredText(LIMITS.city, 'Enter your city or town.'),
    linkedinUrl: linkedinField,
    education: requiredText(LIMITS.education, 'Enter your education or major.'),

    programs: z
      .array(z.enum(valuesOf(PROGRAMS), 'Choose a program from the list.'), 'Choose at least one program.')
      .min(1, 'Choose at least one program.')
      .refine((list) => new Set(list).size === list.length, 'Each program can be chosen only once.'),

    source: z.enum(valuesOf(SOURCES), 'Tell us how you heard about us.'),
    sourceDetail: optionalText(LIMITS.sourceDetail),
    referralName: optionalText(LIMITS.referralName),

    safeSenderConfirmed: z.literal(true, `Please confirm you have added ${HR_EMAIL} to your contacts.`),
    marketingOptIn: z.boolean('Choose yes or no.').default(false),
    smsOptIn: z.boolean('Choose yes or no.').default(false),
  })
  .refine((data) => data.source !== 'OTHER' || Boolean(data.sourceDetail), {
    path: ['sourceDetail'],
    message: 'Tell us where you heard about us.',
    when: unlessInvalid('source', 'sourceDetail'),
  })
  .refine((data) => data.source !== 'REFERRAL' || Boolean(data.referralName), {
    path: ['referralName'],
    message: 'Enter the name of the person who referred you.',
    when: unlessInvalid('source', 'referralName'),
  })
  // Conditional fields are kept only when their source applies, so stale values never reach Twenty.
  .transform((data) => ({
    ...data,
    sourceDetail: data.source === 'OTHER' ? data.sourceDetail : undefined,
    referralName: data.source === 'REFERRAL' ? data.referralName : undefined,
  }));

/** What the form sends (browser state / request body). */
export type ApplicationFormInput = z.input<typeof applicationSchema>;
/** Validated, normalized data the server writes to Twenty. */
export type ApplicationFormData = z.output<typeof applicationSchema>;

export { fieldErrors } from './field-errors';
