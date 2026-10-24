import { labelOf } from '../../config/options';
import { PROGRAMS, TRACKS, trackOf, type ProgramValue, type TrackValue } from '../../config/programs';
import type { AnswerQuestion, BuiltForm, FormConfig, Group, Prefill, Question, Section, TrackStatement } from './types';

// Form engine (T11): merge, ordering, track statements and pre-fill (spec D3, D4).
// One form per applicant: intro once, one section per track they applied in (track-wide
// questions + only their own program questions), closing once.

const isProgram = (value: string): value is ProgramValue => PROGRAMS.some((p) => p.value === value);

/** Throws if a config is inconsistent: duplicate ids, a program in the wrong track, bad showIf. */
export function validateFormConfig(config: FormConfig): void {
  const seen = new Set<string>();
  const check = (questions: readonly Question[], where: string) => {
    for (const q of questions) {
      if (seen.has(q.id)) throw new Error(`${config.formType}: duplicate question id "${q.id}" (${where})`);
      if (q.showIf && !seen.has(q.showIf.questionId)) {
        throw new Error(`${config.formType}: "${q.id}" depends on "${q.showIf.questionId}", which must come earlier`);
      }
      seen.add(q.id);
    }
  };
  check(config.intro, 'intro');
  for (const [track, section] of Object.entries(config.tracks) as [TrackValue, NonNullable<FormConfig['tracks'][TrackValue]>][]) {
    check(section.trackWide, `${track} track-wide`);
    for (const [program, questions] of Object.entries(section.programs) as [string, readonly Question[]][]) {
      if (!isProgram(program)) throw new Error(`${config.formType}: unknown program "${program}"`);
      if (trackOf(program) !== track) throw new Error(`${config.formType}: program "${program}" is not in track "${track}"`);
      check(questions, program);
    }
  }
  check(config.closing, 'closing');
}

export function trackStatement(program: ProgramValue): TrackStatement {
  const track = trackOf(program);
  return {
    program,
    track,
    text: `The program you applied for, ${labelOf(PROGRAMS, program)}, is under the ${labelOf(TRACKS, track)} track.`,
  };
}

/** Builds the form one applicant sees. Unknown program values are ignored; order follows the config files. */
export function buildForm(config: FormConfig, applicantPrograms: readonly string[]): BuiltForm {
  const chosen = new Set(applicantPrograms.filter(isProgram));
  const programs = PROGRAMS.map((p) => p.value).filter((p) => chosen.has(p));
  const tracks = TRACKS.map((t) => t.value).filter((t) => programs.some((p) => trackOf(p) === t));

  const sections: Section[] = [];
  if (config.intro.length) sections.push({ id: 'intro', title: config.introTitle ?? 'About you', kind: 'intro', groups: [{ questions: config.intro }] });

  for (const track of tracks) {
    const trackConfig = config.tracks[track];
    if (!trackConfig) continue;
    const groups: Group[] = [];
    if (trackConfig.trackWide.length) groups.push({ questions: trackConfig.trackWide });
    for (const program of programs.filter((p) => trackOf(p) === track)) {
      const questions = trackConfig.programs[program];
      if (questions?.length) groups.push({ title: labelOf(PROGRAMS, program), program, questions });
    }
    if (groups.length) sections.push({ id: `track:${track}`, title: labelOf(TRACKS, track), kind: 'track', track, groups });
  }

  if (config.closing.length) sections.push({ id: 'closing', title: config.closingTitle ?? 'Closing', kind: 'closing', groups: [{ questions: config.closing }] });

  return {
    formType: config.formType,
    version: config.version,
    programs,
    tracks,
    trackStatements: programs.map(trackStatement),
    sections,
  };
}

/** Every question with an answer, in the order shown. */
export function answerQuestions(form: BuiltForm): AnswerQuestion[] {
  return form.sections.flatMap((s) => s.groups.flatMap((g) => g.questions)).filter((q): q is AnswerQuestion => q.kind !== 'display');
}

export function prefillFor(application: {
  positionAppliedFor: readonly string[];
  person: { name: { firstName: string; lastName: string } | null; emails: { primaryEmail: string } | null } | null;
}): Prefill {
  const name = application.person?.name;
  return {
    fullName: [name?.firstName, name?.lastName].filter(Boolean).join(' '),
    email: application.person?.emails?.primaryEmail ?? '',
    programs: application.positionAppliedFor.filter(isProgram).map((p) => labelOf(PROGRAMS, p)),
  };
}
