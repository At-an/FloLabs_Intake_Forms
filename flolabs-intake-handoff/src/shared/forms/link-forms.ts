import { z } from 'zod';
import { LINK_FORM_CONFIGS, KNOWN_DURATIONS } from '../config/link-forms';
import { labelOf, valuesOf } from '../config/options';
import { answersSchema, buildForm, renderSummary, type BuiltForm, type FormType } from './engine';
import { optionalPhoneInput } from './phone';

// The one Zod schema per link form (Forms 1-3, CLAUDE.md rule 4), shared by the browser and
// the server. The questions depend on the applicant's programs, so the schema is built from
// the form the applicant sees. Form 3 adds two references (spec section 4).

export const REFERENCE_KEYS = ['R1', 'R2'] as const;
export type ReferenceKey = (typeof REFERENCE_KEYS)[number];

export const REFERENCE_LIMITS = { fullName: 150, title: 150, organization: 200, relationship: 150, email: 254 } as const;

const requiredText = (max: number, message: string) =>
  z.string(message).trim().min(1, message).max(max, `Use ${max} characters or fewer.`);

const email = z
  .string('Enter their email address.')
  .trim()
  .toLowerCase()
  .min(1, 'Enter their email address.')
  .max(REFERENCE_LIMITS.email, 'This email address is too long.')
  .pipe(z.email('Enter a valid email address, like name@example.com.'));

const referenceSchema = z.object({
  fullName: requiredText(REFERENCE_LIMITS.fullName, 'Enter their full name.'),
  title: requiredText(REFERENCE_LIMITS.title, 'Enter their position or title.'),
  organization: requiredText(REFERENCE_LIMITS.organization, 'Enter their organization or institution.'),
  relationship: requiredText(REFERENCE_LIMITS.relationship, 'Describe how you know them.'),
  email,
  phone: optionalPhoneInput,
  knownDuration: z.enum(valuesOf(KNOWN_DURATIONS), 'Choose how long they have known you.'),
});

export type ReferenceData = z.output<typeof referenceSchema>;

function referencesSchema(applicantEmail: string) {
  const own = applicantEmail.trim().toLowerCase();
  const hasEmailError = (key: ReferenceKey) => (payload: { issues: readonly { path?: readonly PropertyKey[] }[] }) =>
    payload.issues.some((issue) => issue.path?.[0] === key && issue.path?.[1] === 'email');
  return z
    .object({ R1: z.looseObject({}, 'Add this reference.').pipe(referenceSchema), R2: z.looseObject({}, 'Add this reference.').pipe(referenceSchema) })
    .refine((refs) => !own || refs.R1.email !== own, {
      path: ['R1', 'email'],
      message: "Enter your reference's email address, not your own.",
      when: (payload) => !hasEmailError('R1')(payload),
    })
    .refine((refs) => !own || refs.R2.email !== own, {
      path: ['R2', 'email'],
      message: "Enter your reference's email address, not your own.",
      when: (payload) => !hasEmailError('R2')(payload),
    })
    .refine((refs) => refs.R1.email !== refs.R2.email, {
      path: ['R2', 'email'],
      message: 'Each reference needs a different email address.',
      when: (payload) => !hasEmailError('R1')(payload) && !hasEmailError('R2')(payload),
    });
}

const submissionKey = z.uuid('This form could not be sent. Please reload the page and try again.');

/** Schema of the request body fields the applicant fills (the token and Turnstile are checked separately). */
export function linkFormSchema(form: BuiltForm, { applicantEmail }: { applicantEmail: string }) {
  const answers = answersSchema(form);
  if (form.formType !== 'MASTERCLASS') return z.object({ submissionKey, answers });
  return z.object({ submissionKey, answers, references: z.looseObject({}, 'Add your references.').pipe(referencesSchema(applicantEmail)) });
}

export type LinkFormData = {
  submissionKey: string;
  answers: Record<string, unknown>;
  references?: Record<ReferenceKey, ReferenceData>;
};

/** Builds the form a given applicant sees, from their Application programs. */
export const buildLinkForm = (formType: FormType, programs: readonly string[]) => buildForm(LINK_FORM_CONFIGS[formType], programs);

/** Markdown for answersSummary: the engine summary, plus the references for Form 3. */
export function renderLinkFormSummary(form: BuiltForm, data: LinkFormData): string {
  const summary = renderSummary(form, data.answers);
  if (!data.references) return summary;
  const lines = ['## References', ''];
  REFERENCE_KEYS.forEach((key, index) => {
    const ref = data.references![key];
    lines.push(
      `### Reference ${index + 1}`,
      '',
      `- **Full name:** ${ref.fullName}`,
      `- **Position / Title:** ${ref.title}`,
      `- **Organization / Institution:** ${ref.organization}`,
      `- **Relationship to you:** ${ref.relationship}`,
      `- **Email:** ${ref.email}`,
      `- **Phone:** ${ref.phone ? ref.phone.e164 : '_Not given_'}`,
      `- **Known for:** ${labelOf(KNOWN_DURATIONS, ref.knownDuration)}`,
      '',
    );
  });
  return `${summary}\n${lines.join('\n').trimEnd()}\n`;
}
