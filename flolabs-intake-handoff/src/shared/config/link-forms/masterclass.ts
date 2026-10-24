import type { FormConfig } from '../../forms/engine/types';
import { textarea } from './helpers';
import { CAN_MEET_COMMITMENT } from './options';

// Form 3 (Masterclass), T14: the same for everyone (no track sections). Texts: docs/source
// "Template for the last form". The two references are a fixed block between the intro and
// the closing question, validated by src/shared/forms/link-forms.ts and stored as Reference records.

export const MASTERCLASS_FORM: FormConfig = {
  formType: 'MASTERCLASS',
  version: 'masterclass-v1',
  introTitle: 'Self-assessment and continued interest',
  intro: [
    textarea('M1', 'What is one capability you already have that could help your team, and one capability you know you still need to develop?'),
    { id: 'M2', kind: 'yesno', label: 'After completing the application process and orientation, would you like to continue to the final interview stage?', required: true, field: 'continueToInterview' },
    { id: 'M3', kind: 'radio', label: 'Based on everything you now understand about the program, can you realistically meet the required commitment for your selected program?', required: true, options: CAN_MEET_COMMITMENT, field: 'canMeetCommitment' },
    textarea('M4', 'What would you like clarified during your final interview?', { required: false }),
  ],
  tracks: {},
  closingTitle: 'Contacting your references',
  closing: [
    { id: 'M5', kind: 'yesno', label: 'May FloLabs contact these references as part of the application review process?', required: true, field: 'referencesContactAllowed' },
    textarea('M5b', 'Please explain briefly why we should not contact them.', { showIf: { questionId: 'M5', equals: false } }),
  ],
};

export const REFERENCES_INTRO = [
  'Please provide professional or academic references who can speak to your reliability, work ethic, academic performance, research ability, technical skills, or professional conduct.',
  'References may include professors, academic supervisors, research supervisors, previous managers, team leads, internship supervisors, or other professionals who have directly worked with or supervised you.',
  'Please do not list family members or personal friends.',
] as const;
