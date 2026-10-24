// CV rules shared by the form (instant feedback from name and size) and the server
// (which also checks the file signature, see src/server/applications/cv.ts).

export const MAX_CV_BYTES = 5 * 1024 * 1024;

export const CV_TYPES = {
  pdf: { extension: '.pdf', mime: 'application/pdf' },
  docx: { extension: '.docx', mime: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' },
} as const;

export type CvKind = keyof typeof CV_TYPES;

export const CV_ACCEPT = Object.values(CV_TYPES)
  .flatMap((t) => [t.extension, t.mime])
  .join(',');

export const CV_MESSAGES = {
  missing: 'Attach your CV (PDF or Word .docx).',
  type: 'Your CV must be a PDF or a Word (.docx) file.',
  empty: 'This file is empty. Please choose your CV again.',
  tooLarge: 'Your CV must be 5 MB or smaller.',
} as const;

/** Instant check in the browser; the server repeats it and verifies the content. */
export function cvProblem(file: { name: string; size: number } | null | undefined): string | null {
  if (!file) return CV_MESSAGES.missing;
  const name = file.name.toLowerCase();
  if (!Object.values(CV_TYPES).some((t) => name.endsWith(t.extension))) return CV_MESSAGES.type;
  if (file.size === 0) return CV_MESSAGES.empty;
  if (file.size > MAX_CV_BYTES) return CV_MESSAGES.tooLarge;
  return null;
}
