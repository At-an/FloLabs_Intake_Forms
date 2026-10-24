import { validateFormConfig } from '../../forms/engine/build';
import type { FormConfig, FormType } from '../../forms/engine/types';
import { BEFORE_MEETING_FORM } from './before-meeting';
import { CONTACTED_FORM } from './contacted';
import { MASTERCLASS_FORM } from './masterclass';

export { REFERENCES_INTRO } from './masterclass';
export * from './options';

/** The question config of each link form (T12-T14). */
export const LINK_FORM_CONFIGS: Record<FormType, FormConfig> = {
  CONTACTED: CONTACTED_FORM,
  BEFORE_MEETING: BEFORE_MEETING_FORM,
  MASTERCLASS: MASTERCLASS_FORM,
};

// Fail fast on a broken config (duplicate ids, a program in the wrong track, bad showIf).
for (const config of Object.values(LINK_FORM_CONFIGS)) validateFormConfig(config);
