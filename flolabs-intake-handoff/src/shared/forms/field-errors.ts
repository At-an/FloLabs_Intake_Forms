import type { z } from 'zod';

/**
 * Field -> first error message, for inline errors in the UI. Nested objects use dots
 * (`phone.number`); array positions are dropped so list errors land on the list (`programs`).
 */
export function fieldErrors(error: z.ZodError): Partial<Record<string, string>> {
  const errors: Partial<Record<string, string>> = {};
  for (const issue of error.issues) {
    const segments: string[] = [];
    for (const segment of issue.path) {
      if (typeof segment === 'number') break;
      segments.push(String(segment));
    }
    const key = segments.length ? segments.join('.') : 'form';
    errors[key] ??= issue.message;
  }
  return errors;
}
