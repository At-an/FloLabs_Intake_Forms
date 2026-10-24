import { describe, expect, it } from 'vitest';
import { answerQuestions, answersSchema } from '../../forms/engine';
import { fieldErrors } from '../../forms/field-errors';
import { buildLinkForm } from '../../forms/link-forms';
import { PROGRAMS } from '../programs';
import { LINK_FORM_CONFIGS } from '.';

// Coverage of the real Form 1-3 configs against spec sections 2-4 and 8.

const programQuestionIds = (formType: 'CONTACTED' | 'BEFORE_MEETING', program: string) =>
  buildLinkForm(formType, [program])
    .sections.filter((s) => s.kind === 'track')
    .flatMap((s) => s.groups.filter((g) => g.program === program))
    .flatMap((g) => g.questions.filter((q) => q.kind !== 'display').map((q) => q.id));

describe('Form 1 config (T12)', () => {
  it.each(PROGRAMS.map((p) => [p.value, p.track]))('%s gets its track section', (program, track) => {
    const form = buildLinkForm('CONTACTED', [program]);
    expect(form.sections.map((s) => s.id)).toEqual(['intro', `track:${track}`, 'closing']);
  });

  it('has the spec number of questions per program (spec 2a)', () => {
    const counts = Object.fromEntries(PROGRAMS.map((p) => [p.value, programQuestionIds('CONTACTED', p.value).length]));
    const three = [
      'PROMPT_ENGINEER_INTERN', 'QUALITY_ASSURANCE_INTERN', 'RESEARCH_ASSOCIATE_INTERN_OPEN_SOURCE_PROJECTS',
      'ROBOTICS_ENGINEERING_INTERN', 'HUMAN_ROBOT_INTERACTION_INTERN', 'MECHATRONICS_ENGINEERING_INTERN', 'SENSOR_INTEGRATION_INTERN',
      'FINANCE_INTERN', 'GTM_ENGINEER_GO_TO_MARKET_ENGINEER_INTERN', 'HOSPITALITY_AND_TOURISM_INTERN', 'PODCAST_PRODUCTION_INTERN_POSITION',
      'UI_UX_DESIGN_INTERN', 'TECHNICAL_WRITING_INTERN', 'JOURNALISM_PR_INTERN',
      'SPACE_SCIENCE_INTERN', 'SPORT_SCIENCE_INTERN', 'ETHICAL_AND_LEGAL_RESEARCH_INTERN', 'ANIMAL_SCIENCE_AND_VETERINARY_RESEARCH_INTERN',
      'BIOMEDICAL_ENGINEERING_INTERN', 'EDTECH_AND_INNOVATION_INTERN', 'QUANTUM_ENGINEER_INTERN',
    ];
    for (const program of PROGRAMS.map((p) => p.value)) expect([program, counts[program]]).toEqual([program, three.includes(program) ? 3 : 1]);
  });

  it('asks the general, track-wide and closing questions of the spec (G4-G13, C1)', () => {
    const ids = answerQuestions(buildLinkForm('CONTACTED', ['AI_AGI_INTERN'])).map((q) => q.id);
    expect(ids).toEqual(['G4', 'G5', 'G6', 'G7', 'G8', 'G9', 'G10', 'G11', 'G12', 'G13', 'AI1', 'AI2', 'AI3', 'AGI1', 'C1']);
    const optional = answerQuestions(buildLinkForm('CONTACTED', ['AI_AGI_INTERN'])).filter((q) => !q.required).map((q) => q.id);
    expect(optional).toEqual(['G10', 'G13']);
  });

  it('shows the Technical Writing snippet before its rewrite question', () => {
    const group = buildLinkForm('CONTACTED', ['TECHNICAL_WRITING_INTERN']).sections[1]!.groups[0]!;
    expect(group.questions.map((q) => q.id)).toEqual(['TW1', 'TW2', 'TW3_SNIPPET', 'TW3']);
  });

  it('asks for the other tools only when RO3 includes Other', () => {
    const schema = answersSchema(buildLinkForm('CONTACTED', ['EMBEDDED_SYSTEMS_INTERN']));
    const errors = (RO3: string[], RO3b?: string) => {
      const result = schema.safeParse({ RO3, RO3b });
      return result.success ? {} : fieldErrors(result.error);
    };
    expect(errors(['ARDUINO', 'OTHER']).RO3b).toBe('Please answer this question.');
    expect(errors(['ARDUINO', 'OTHER'], 'KiCad').RO3b).toBeUndefined();
    expect(errors(['ARDUINO']).RO3b).toBeUndefined();
    expect(errors([]).RO3).toBe('Please answer this question.');
  });

  it('merges a cross-track applicant into one form with one section per track', () => {
    const form = buildLinkForm('CONTACTED', ['SPORT_SCIENCE_INTERN', 'ROBOTICS_ENGINEERING_INTERN', 'SEO_SPECIALIST_INTERN']);
    expect(form.sections.map((s) => s.id)).toEqual([
      'intro',
      'track:ROBOTICS_INTELLIGENT_SYSTEMS',
      'track:BUSINESS_GROWTH_ENTREPRENEURSHIP',
      'track:EMERGING_SCIENCES_TECHNOLOGY',
      'closing',
    ]);
  });
});

describe('Form 2 config (T13)', () => {
  it.each(PROGRAMS.map((p) => [p.value, p.track]))('%s gets its track section', (program, track) => {
    expect(buildLinkForm('BEFORE_MEETING', [program]).sections.map((s) => s.id)).toEqual(['intro', `track:${track}`, 'closing']);
  });

  it('has the spec number of questions (spec 3a)', () => {
    const trackWide = (program: string) => buildLinkForm('BEFORE_MEETING', [program]).sections[1]!.groups.filter((g) => !g.program).flatMap((g) => g.questions).length;
    expect(trackWide('AI_AGI_INTERN')).toBe(2);
    expect(trackWide('NEUROSCIENCE_INTERN')).toBe(2);
    const expected: Record<string, number> = {
      BUSINESS_DEVELOPMENT_AND_SALES_INTERN_AI_AND_ROBOTICS: 1, MARKETING_INTERN: 1, CONTENT_MARKETING_INTERN: 1, GTM_INFLUENCER_INTERN: 1,
      SEO_SPECIALIST_INTERN: 1, SOCIAL_MEDIA_INTERN: 1, PROJECT_MANAGEMENT_INTERN: 1, OPERATIONS_INTERN: 1,
      DIGITAL_MARKETING_INTERN: 2, FINANCE_INTERN: 2, GTM_ENGINEER_GO_TO_MARKET_ENGINEER_INTERN: 2, HOSPITALITY_AND_TOURISM_INTERN: 2, PODCAST_PRODUCTION_INTERN_POSITION: 2,
      UI_UX_DESIGN_INTERN: 3, TECHNICAL_WRITING_INTERN: 2, JOURNALISM_PR_INTERN: 3,
      SPACE_SCIENCE_INTERN: 3, SPORT_SCIENCE_INTERN: 3, ETHICAL_AND_LEGAL_RESEARCH_INTERN: 3, ANIMAL_SCIENCE_AND_VETERINARY_RESEARCH_INTERN: 3,
      BIOMEDICAL_ENGINEERING_INTERN: 3, EDTECH_AND_INNOVATION_INTERN: 3, QUANTUM_ENGINEER_INTERN: 3,
    };
    for (const [program, count] of Object.entries(expected)) expect([program, programQuestionIds('BEFORE_MEETING', program).length]).toEqual([program, count]);
  });
});

describe('Form 3 config (T14)', () => {
  it('is the same for everyone: intro M1-M4 and closing M5/M5b, no track sections', () => {
    const form = buildLinkForm('MASTERCLASS', ['AI_AGI_INTERN', 'FINANCE_INTERN']);
    expect(form.sections.map((s) => s.id)).toEqual(['intro', 'closing']);
    expect(answerQuestions(form).map((q) => q.id)).toEqual(['M1', 'M2', 'M3', 'M4', 'M5', 'M5b']);
    expect(form.tracks).toEqual(['AI_SOFTWARE_ENGINEERING', 'BUSINESS_GROWTH_ENTREPRENEURSHIP']);
  });

  it('versions every config', () => {
    expect(Object.values(LINK_FORM_CONFIGS).map((c) => c.version)).toEqual(['contacted-v1', 'before-meeting-v1', 'masterclass-v1']);
  });
});
