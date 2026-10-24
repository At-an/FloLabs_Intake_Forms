import type { Question, ShowIf } from '../../forms/engine/types';

// Shorthands for the Form 1-3 configs: most questions are required textareas.

export const textarea = (id: string, label: string, extra: { required?: boolean; help?: string; maxLength?: number; showIf?: ShowIf } = {}): Question => ({
  id,
  kind: 'textarea',
  label,
  required: true,
  ...extra,
});

/** One required textarea per label, ids `<prefix>1`, `<prefix>2`, ... */
export const textareas = (prefix: string, labels: readonly string[]): Question[] =>
  labels.map((label, index) => textarea(`${prefix}${index + 1}`, label));
