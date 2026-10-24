import { z } from 'zod';
import { labelOf, valuesOf } from '../../config/options';
import { answerQuestions } from './build';
import type { AnswerQuestion, BuiltForm, TypedField } from './types';

// Answers for a built form (T11): one Zod schema (CLAUDE.md rule 4), the readable markdown
// summary stored in Form Submission.answersSummary, and the typed filter fields.

export type Answers = Record<string, unknown>;

const REQUIRED = 'Please answer this question.';
const DEFAULT_MAX_TEXT = 5000;

function answerSchema(q: AnswerQuestion): z.ZodType {
  switch (q.kind) {
    case 'text':
    case 'textarea': {
      const max = q.maxLength ?? DEFAULT_MAX_TEXT;
      return z
        .string(REQUIRED)
        .trim()
        .max(max, `Use ${max} characters or fewer.`)
        .transform((v) => v || undefined);
    }
    case 'number':
      return z
        .number(REQUIRED)
        .int('Enter a whole number.')
        .min(q.min, `Enter a number from ${q.min} to ${q.max}.`)
        .max(q.max, `Enter a number from ${q.min} to ${q.max}.`);
    case 'select':
    case 'radio':
      return z.enum(valuesOf(q.options), 'Choose one of the options.');
    case 'multiselect':
      return z
        .array(z.enum(valuesOf(q.options), 'Choose from the list.'), REQUIRED)
        .refine((list) => new Set(list).size === list.length, 'Each option can be chosen only once.')
        .transform((list) => (list.length ? list : undefined));
    case 'yesno':
      return z.boolean(REQUIRED);
    case 'links':
      return z
        .array(z.url({ protocol: /^https?$/, error: 'Enter a full link starting with https://.' }), REQUIRED)
        .max(q.maxItems, `Add at most ${q.maxItems} links.`)
        .transform((list) => (list.length ? list : undefined));
  }
}

const isVisible = (q: AnswerQuestion, answers: Answers) => !q.showIf || answers[q.showIf.questionId] === q.showIf.equals;
const isEmpty = (value: unknown) => value === undefined || value === null || (Array.isArray(value) && value.length === 0);

/**
 * Zod schema for the answers of one built form. Unknown keys are dropped, hidden conditional
 * answers are dropped, and required questions (when visible) must be answered.
 */
export function answersSchema(form: BuiltForm) {
  const questions = answerQuestions(form);
  const shape = Object.fromEntries(questions.map((q) => [q.id, answerSchema(q).optional()]));
  // One check per required question, run even when other answers have errors (Zod skips
  // object-level checks after a type error elsewhere unless `when` says otherwise).
  let schema: z.ZodType<Answers> = z.object(shape);
  for (const q of questions.filter((question) => question.required)) {
    schema = schema.refine((answers) => !(isVisible(q, answers) && isEmpty(answers[q.id])), {
      path: [q.id],
      message: REQUIRED,
      when: (payload) => !payload.issues.some((issue) => issue.path?.[0] === q.id),
    });
  }
  return schema.transform((answers) => {
    const kept: Answers = {};
    for (const q of questions) if (isVisible(q, answers) && !isEmpty(answers[q.id])) kept[q.id] = answers[q.id];
    return kept;
  });
}

function formatAnswer(q: AnswerQuestion, value: unknown): string {
  switch (q.kind) {
    case 'yesno':
      return value ? 'Yes' : 'No';
    case 'select':
    case 'radio':
      return labelOf(q.options, value as string);
    case 'multiselect':
      return (value as string[]).map((v) => `- ${labelOf(q.options, v)}`).join('\n');
    case 'links':
      return (value as string[]).map((url) => `- <${url}>`).join('\n');
    case 'number':
      return String(value);
    case 'text':
    case 'textarea':
      return String(value);
  }
}

/** Markdown for Form Submission.answersSummary: one heading per section, then each question and its answer. */
export function renderSummary(form: BuiltForm, answers: Answers): string {
  const lines: string[] = [];
  for (const section of form.sections) {
    lines.push(`## ${section.title}`, '');
    for (const group of section.groups) {
      if (group.title) lines.push(`### ${group.title}`, '');
      for (const q of group.questions) {
        if (q.kind === 'display') continue;
        if (!isVisible(q, answers)) continue;
        const value = answers[q.id];
        lines.push(`**${q.label}**`, isEmpty(value) ? '_No answer_' : formatAnswer(q, value), '');
      }
    }
  }
  return lines.join('\n').trimEnd() + '\n';
}

/** Values for the typed Form Submission fields (hoursPerWeek, remoteOk, ...) from the answers. */
export function typedFieldValues(form: BuiltForm, answers: Answers): Partial<Record<TypedField, unknown>> {
  const values: Partial<Record<TypedField, unknown>> = {};
  for (const q of answerQuestions(form)) if (q.field && answers[q.id] !== undefined) values[q.field] = answers[q.id];
  return values;
}
