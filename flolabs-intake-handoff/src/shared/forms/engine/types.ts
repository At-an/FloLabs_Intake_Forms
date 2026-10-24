import type { Option } from '../../config/options';
import type { ProgramValue, TrackValue } from '../../config/programs';

// Form engine types (T11). A FormConfig describes one link form (Form 1, 2 or 3); buildForm()
// turns it into the sections a given applicant sees. Answers are stored keyed by question id.

/** Form Submission fields people filter on (spec section 7); a question can feed one of them. */
export type TypedField =
  | 'hoursPerWeek'
  | 'commitmentDuration'
  | 'remoteOk'
  | 'canAttendMeetings'
  | 'stillInterested'
  | 'continueToInterview'
  | 'canMeetCommitment'
  | 'referencesContactAllowed';

/** Show (and require) a question only when another answer has a given value (or, for a multi-select, includes it). */
export type ShowIf = { questionId: string; equals: string | boolean } | { questionId: string; includes: string };

type Base = {
  id: string;
  label: string;
  required: boolean;
  help?: string;
  showIf?: ShowIf;
  field?: TypedField;
};

export type Question =
  | (Base & { kind: 'text' | 'textarea'; maxLength?: number })
  | (Base & { kind: 'number'; min: number; max: number })
  | (Base & { kind: 'select' | 'radio'; options: readonly Option[] })
  | (Base & { kind: 'multiselect'; options: readonly Option[] })
  | (Base & { kind: 'yesno' })
  | (Base & { kind: 'links'; maxItems: number })
  /** Read-only text shown to the applicant (e.g. a snippet to rewrite); has no answer. */
  | { kind: 'display'; id: string; text: string; showIf?: undefined; field?: undefined };

export type AnswerQuestion = Exclude<Question, { kind: 'display' }>;

export type TrackConfig = {
  /** Asked once to everyone in the track. */
  trackWide: readonly Question[];
  /** Asked only to applicants of that program. */
  programs: Partial<Record<ProgramValue, readonly Question[]>>;
};

export type FormType = 'CONTACTED' | 'BEFORE_MEETING' | 'MASTERCLASS';

export type FormConfig = {
  formType: FormType;
  version: string;
  /** Questions before the track sections (Form 1 general part, Form 2 B1, Form 3 everything). */
  intro: readonly Question[];
  /** Section headings; default "About you" and "Closing". */
  introTitle?: string;
  closingTitle?: string;
  /** Per-track sections; Form 3 has none. */
  tracks: Partial<Record<TrackValue, TrackConfig>>;
  /** Asked once at the end. */
  closing: readonly Question[];
};

export type Group = { title?: string; program?: ProgramValue; questions: readonly Question[] };

export type Section = {
  id: string;
  title: string;
  kind: 'intro' | 'track' | 'closing';
  track?: TrackValue;
  groups: readonly Group[];
};

export type TrackStatement = { program: ProgramValue; track: TrackValue; text: string };

export type BuiltForm = {
  formType: FormType;
  version: string;
  programs: readonly ProgramValue[];
  tracks: readonly TrackValue[];
  trackStatements: readonly TrackStatement[];
  sections: readonly Section[];
};

/** Read-only pre-fill shown at the top of Form 1 (spec D4). */
export type Prefill = { fullName: string; email: string; programs: readonly string[] };
