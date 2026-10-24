import { describe, expect, it } from 'vitest';
import { answersSchema, buildForm, prefillFor, renderSummary, typedFieldValues, validateFormConfig, type FormConfig } from '.';
import { fieldErrors } from '../field-errors';

// A small config shaped like Form 1 (real question texts arrive in T12).
const config: FormConfig = {
  formType: 'CONTACTED',
  version: 'test-1',
  intro: [
    { id: 'G4', kind: 'textarea', label: 'Why are you interested in this specific program?', required: true },
    { id: 'G8', kind: 'number', label: 'Hours per week you can commit', required: true, min: 1, max: 40, field: 'hoursPerWeek' },
    {
      id: 'G9',
      kind: 'select',
      label: 'How long can you maintain that commitment?',
      required: true,
      field: 'commitmentDuration',
      options: [
        { value: 'UNDER_3_MONTHS', label: 'Under 3 months' },
        { value: 'MONTHS_3_TO_6', label: '3-6 months' },
      ],
    },
    { id: 'G11', kind: 'yesno', label: 'Comfortable working remotely in a team?', required: true, field: 'remoteOk' },
    { id: 'G10', kind: 'links', label: 'Portfolio / GitHub / LinkedIn / website', required: false, maxItems: 3 },
  ],
  tracks: {
    AI_SOFTWARE_ENGINEERING: {
      trackWide: [{ id: 'AI1', kind: 'textarea', label: 'Your most challenging project', required: true }],
      programs: {
        AI_AGI_INTERN: [{ id: 'AI_AGI_1', kind: 'textarea', label: 'AI/AGI question', required: true }],
        BACKEND_DEVELOPER_INTERN: [{ id: 'BE_1', kind: 'textarea', label: 'Backend question', required: true }],
      },
    },
    DESIGN_TECHNICAL_COMMUNICATION: {
      trackWide: [],
      programs: {
        UI_UX_DESIGN_INTERN: [{ id: 'DE1', kind: 'links', label: 'Portfolio link', required: true, maxItems: 1 }],
        TECHNICAL_WRITING_INTERN: [
          { id: 'TW3_SNIPPET', kind: 'display', text: 'To use the export you need to go to settings first...' },
          { id: 'TW3', kind: 'textarea', label: 'Rewrite this snippet', required: true },
        ],
      },
    },
    BUSINESS_GROWTH_ENTREPRENEURSHIP: {
      trackWide: [{ id: 'BU1', kind: 'textarea', label: 'A project with a measurable outcome', required: true }],
      programs: { FINANCE_INTERN: [{ id: 'FI_1', kind: 'textarea', label: 'Finance question', required: true }] },
    },
  },
  closing: [
    {
      id: 'C1',
      kind: 'radio',
      label: 'Are you still interested?',
      required: true,
      field: 'stillInterested',
      options: [
        { value: 'YES_DEFINITELY', label: 'Yes definitely' },
        { value: 'YES_WITH_QUESTIONS', label: 'Yes but I have questions' },
      ],
    },
    { id: 'C1b', kind: 'textarea', label: 'Your questions', required: true, showIf: { questionId: 'C1', equals: 'YES_WITH_QUESTIONS' } },
  ],
};

const outline = (programs: string[]) =>
  buildForm(config, programs).sections.map((s) => [s.id, s.groups.map((g) => g.title ?? '(track-wide)')]);

describe('buildForm: sections per applicant (D3)', () => {
  it.each([
    [
      'one program',
      ['AI_AGI_INTERN'],
      [
        ['intro', ['(track-wide)']],
        ['track:AI_SOFTWARE_ENGINEERING', ['(track-wide)', 'AI/AGI Intern']],
        ['closing', ['(track-wide)']],
      ],
    ],
    [
      'two programs in one track: track-wide questions once',
      ['BACKEND_DEVELOPER_INTERN', 'AI_AGI_INTERN'],
      [
        ['intro', ['(track-wide)']],
        ['track:AI_SOFTWARE_ENGINEERING', ['(track-wide)', 'AI/AGI Intern', 'Backend Developer Intern']],
        ['closing', ['(track-wide)']],
      ],
    ],
    [
      'cross-track applicant: one merged form, one section per track, in track order',
      ['FINANCE_INTERN', 'UI_UX_DESIGN_INTERN', 'AI_AGI_INTERN'],
      [
        ['intro', ['(track-wide)']],
        ['track:AI_SOFTWARE_ENGINEERING', ['(track-wide)', 'AI/AGI Intern']],
        ['track:BUSINESS_GROWTH_ENTREPRENEURSHIP', ['(track-wide)', 'Finance Intern']],
        ['track:DESIGN_TECHNICAL_COMMUNICATION', ['UI/UX Design Intern']],
        ['closing', ['(track-wide)']],
      ],
    ],
    [
      'a program without questions in the config: no empty section',
      ['NEUROSCIENCE_INTERN'],
      [
        ['intro', ['(track-wide)']],
        ['closing', ['(track-wide)']],
      ],
    ],
  ])('%s', (_case, programs, expected) => {
    expect(outline(programs)).toEqual(expected);
  });

  it('only shows the applicant’s own program questions', () => {
    const ids = buildForm(config, ['AI_AGI_INTERN']).sections.flatMap((s) => s.groups.flatMap((g) => g.questions.map((q) => q.id)));
    expect(ids).toContain('AI_AGI_1');
    expect(ids).not.toContain('BE_1');
  });

  it('ignores unknown program values and duplicates', () => {
    expect(buildForm(config, ['AI_AGI_INTERN', 'AI_AGI_INTERN', 'Not a program']).programs).toEqual(['AI_AGI_INTERN']);
  });

  it('writes one track statement per program (D4)', () => {
    expect(buildForm(config, ['UI_UX_DESIGN_INTERN', 'AI_AGI_INTERN']).trackStatements.map((s) => s.text)).toEqual([
      'The program you applied for, AI/AGI Intern, is under the AI & Software Engineering track.',
      'The program you applied for, UI/UX Design Intern, is under the Design & Technical Communication track.',
    ]);
  });

  it('lists the tracks of the applicant for Form Submission.tracks', () => {
    expect(buildForm(config, ['FINANCE_INTERN', 'AI_AGI_INTERN']).tracks).toEqual(['AI_SOFTWARE_ENGINEERING', 'BUSINESS_GROWTH_ENTREPRENEURSHIP']);
  });
});

describe('validateFormConfig', () => {
  it('accepts the sample config', () => {
    expect(() => validateFormConfig(config)).not.toThrow();
  });

  it('rejects duplicate ids, programs in the wrong track and forward showIf references', () => {
    const duplicate: FormConfig = { ...config, closing: [...config.closing, { id: 'G4', kind: 'yesno', label: 'x', required: false }] };
    expect(() => validateFormConfig(duplicate)).toThrow(/duplicate question id "G4"/);
    const wrongTrack: FormConfig = {
      ...config,
      tracks: { AI_SOFTWARE_ENGINEERING: { trackWide: [], programs: { FINANCE_INTERN: [] } } },
    };
    expect(() => validateFormConfig(wrongTrack)).toThrow(/not in track/);
    const forward: FormConfig = {
      ...config,
      intro: [{ id: 'X', kind: 'text', label: 'x', required: true, showIf: { questionId: 'C1', equals: 'NO' } }],
    };
    expect(() => validateFormConfig(forward)).toThrow(/must come earlier/);
  });
});

describe('answersSchema', () => {
  const form = buildForm(config, ['AI_AGI_INTERN', 'TECHNICAL_WRITING_INTERN']);
  const schema = answersSchema(form);
  const complete = {
    G4: 'Because I love AI.',
    G8: 12,
    G9: 'MONTHS_3_TO_6',
    G11: true,
    AI1: 'A robot arm.',
    AI_AGI_1: 'Transformers.',
    TW3: 'Go to Settings > Export.',
    C1: 'YES_DEFINITELY',
  };

  it('accepts complete answers and drops unknown keys', () => {
    const result = schema.safeParse({ ...complete, injected: 'x', BE_1: 'not my program' });
    expect(result.success && result.data).toEqual(complete);
  });

  it('requires every visible required question, with one message', () => {
    const result = schema.safeParse({});
    const errors = result.success ? {} : fieldErrors(result.error);
    expect(Object.keys(errors).sort()).toEqual(['AI1', 'AI_AGI_1', 'C1', 'G11', 'G4', 'G8', 'G9', 'TW3']);
    expect(errors.G4).toBe('Please answer this question.');
  });

  it('enforces number range, whole numbers and allowed options', () => {
    const errors = (input: object) => {
      const r = schema.safeParse({ ...complete, ...input });
      return r.success ? {} : fieldErrors(r.error);
    };
    expect(errors({ G8: 41 }).G8).toBe('Enter a number from 1 to 40.');
    expect(errors({ G8: 2.5 }).G8).toBe('Enter a whole number.');
    expect(errors({ G9: 'FOREVER' }).G9).toBe('Choose one of the options.');
  });

  it('requires a conditional question only when it is shown, and drops it otherwise', () => {
    const withQuestions = schema.safeParse({ ...complete, C1: 'YES_WITH_QUESTIONS' });
    expect(withQuestions.success ? {} : fieldErrors(withQuestions.error)).toEqual({ C1b: 'Please answer this question.' });
    const hidden = schema.safeParse({ ...complete, C1: 'YES_DEFINITELY', C1b: 'stale text' });
    expect(hidden.success && 'C1b' in hidden.data).toBe(false);
  });

  it('still reports missing required answers when another answer has the wrong type', () => {
    const result = schema.safeParse({ ...complete, G8: 'twelve', G4: undefined });
    const errors = result.success ? {} : fieldErrors(result.error);
    expect(errors).toMatchObject({ G8: expect.any(String), G4: 'Please answer this question.' });
  });
});

describe('summary and typed fields', () => {
  const form = buildForm(config, ['UI_UX_DESIGN_INTERN']);
  const answers = {
    G4: 'Design matters.',
    G8: 10,
    G9: 'UNDER_3_MONTHS',
    G11: false,
    DE1: ['https://janedoe.design'],
    C1: 'YES_WITH_QUESTIONS',
    C1b: 'When does it start?',
  };

  it('renders readable markdown with option labels, Yes/No and links', () => {
    expect(renderSummary(form, answers)).toBe(
      [
        '## About you',
        '',
        '**Why are you interested in this specific program?**',
        'Design matters.',
        '',
        '**Hours per week you can commit**',
        '10',
        '',
        '**How long can you maintain that commitment?**',
        'Under 3 months',
        '',
        '**Comfortable working remotely in a team?**',
        'No',
        '',
        '**Portfolio / GitHub / LinkedIn / website**',
        '_No answer_',
        '',
        '## Design & Technical Communication',
        '',
        '### UI/UX Design Intern',
        '',
        '**Portfolio link**',
        '- <https://janedoe.design>',
        '',
        '## Closing',
        '',
        '**Are you still interested?**',
        'Yes but I have questions',
        '',
        '**Your questions**',
        'When does it start?',
        '',
      ].join('\n'),
    );
  });

  it('extracts the typed filter fields', () => {
    expect(typedFieldValues(form, answers)).toEqual({
      hoursPerWeek: 10,
      commitmentDuration: 'UNDER_3_MONTHS',
      remoteOk: false,
      stillInterested: 'YES_WITH_QUESTIONS',
    });
  });
});

describe('prefillFor (D4)', () => {
  it('gives read-only name, email and program labels', () => {
    expect(
      prefillFor({
        positionAppliedFor: ['UI_UX_DESIGN_INTERN', 'FINANCE_INTERN'],
        person: { name: { firstName: 'Atankeu', lastName: 'Natanahel' }, emails: { primaryEmail: 'zoom+t5test@flomadlabs.com' } },
      }),
    ).toEqual({ fullName: 'Atankeu Natanahel', email: 'zoom+t5test@flomadlabs.com', programs: ['UI/UX Design Intern', 'Finance Intern'] });
  });
});
