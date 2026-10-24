import type { FormConfig } from '../../forms/engine/types';
import { textarea, textareas } from './helpers';
import { STILL_INTERESTED } from './options';

// Form 2 (Before Meeting), T13. Existing question texts: docs/source "Template for second form";
// new program questions: spec section 8. AI and Robotics have track-wide questions only.
// Bump `version` whenever a question text or rule changes.

export const BEFORE_MEETING_FORM: FormConfig = {
  formType: 'BEFORE_MEETING',
  version: 'before-meeting-v1',
  tracksStepTitle: 'Thought and Feedback',
  introTitle: 'Program overview',
  intro: [{ id: 'B1', kind: 'yesno', label: 'Have you reviewed the program experience overview in the previous form?', required: true }],
  tracks: {
    AI_SOFTWARE_ENGINEERING: {
      trackWide: textareas('AI', [
        'Based on what you have understood about our projects relevant to your track, where do you think your current skills could contribute most?',
        'What is one area in which you would need to improve in order to contribute effectively?',
      ]),
      programs: {},
    },
    ROBOTICS_INTELLIGENT_SYSTEMS: {
      trackWide: textareas('RO', [
        'Which FloLabs technical problem or project interests you most, and why?',
        'What technical area would you most need to strengthen before contributing effectively?',
      ]),
      programs: {},
    },
    BUSINESS_GROWTH_ENTREPRENEURSHIP: {
      trackWide: [],
      programs: {
        BUSINESS_DEVELOPMENT_AND_SALES_INTERN_AI_AND_ROBOTICS: textareas('BD', ['Which FloLabs product or initiative do you believe has the clearest commercial opportunity, and who would you approach as the customer?']),
        MARKETING_INTERN: textareas('MK', ['Which audience would you prioritize for the FloLabs initiative you reviewed in the course of your application, and why?']),
        CONTENT_MARKETING_INTERN: textareas('CM', ["What story or educational angle could you develop from the FloLabs project(s) you've reviewed during the course of your application?"]),
        GTM_INFLUENCER_INTERN: textareas('GI', ['If you had to introduce any FloLabs product or initiative to a new audience, what would your first content or distribution approach be?']),
        SEO_SPECIALIST_INTERN: textareas('SEO', ['What search intent or audience could realistically lead people to the FloLabs product or initiative you reviewed during the course of your application?']),
        SOCIAL_MEDIA_INTERN: [
          textarea('SM1', "Which social platform would you prioritize for the FloLabs project or initiative you've reviewed so far and what type of content would you test?", {
            help: 'List as many as you can, if more than one.',
          }),
        ],
        PROJECT_MANAGEMENT_INTERN: textareas('PM', ["What dependencies, owners, milestones, or risks did you notice in the FloLabs work you've seen so far?"]),
        OPERATIONS_INTERN: textareas('OP', ['What recurring process from the FloLabs work you reviewed so far could potentially be made more efficient?']),
        DIGITAL_MARKETING_INTERN: textareas('DM', [
          'Which digital channel would you test first for the FloLabs initiative you reviewed, and why?',
          'Which marketing skill do you need to strengthen to contribute effectively?',
        ]),
        FINANCE_INTERN: textareas('FI', [
          'Which financial task could you help with first at FloLabs (for example budgeting, reporting, or pricing)?',
          'Which finance skill or tool do you need to strengthen?',
        ]),
        GTM_ENGINEER_GO_TO_MARKET_ENGINEER_INTERN: textareas('GE', [
          'Which FloLabs sales or marketing process could you help automate first?',
          'Which tool or skill do you need to strengthen to build it?',
        ]),
        HOSPITALITY_AND_TOURISM_INTERN: textareas('HT', [
          'Which FloLabs product or initiative could improve a hospitality or tourism experience?',
          'Which skill do you need to strengthen to contribute?',
        ]),
        PODCAST_PRODUCTION_INTERN_POSITION: textareas('PP', [
          'Which FloLabs project or topic would make a good podcast episode?',
          'Which production skill do you need to strengthen?',
        ]),
      },
    },
    DESIGN_TECHNICAL_COMMUNICATION: {
      trackWide: [],
      programs: {
        UI_UX_DESIGN_INTERN: textareas('DE', [
          'What is one aspect of our product experience that you think works well?',
          'What is one usability problem or design question you would investigate further?',
          'What would you want to learn about the users before recommending a solution?',
        ]),
        TECHNICAL_WRITING_INTERN: textareas('TW', [
          'Which part of our products or initiative you reviewed so far would be hardest for a new user or team member to understand?',
          'How would you make that information clearer?',
        ]),
        JOURNALISM_PR_INTERN: textareas('JP', [
          'Which FloLabs project or story would you pitch to the media first?',
          'Which audience or media outlet would you target?',
          'Which writing or PR skill do you need to strengthen?',
        ]),
      },
    },
    EMERGING_SCIENCES_TECHNOLOGY: {
      trackWide: [],
      programs: {
        SPACE_SCIENCE_INTERN: textareas('SP', [
          'Which problem, research direction, or opportunity here at FloLabs interests you most?',
          'What question would you want to investigate further?',
          'What existing skill could you bring to that investigation?',
        ]),
        SPORT_SCIENCE_INTERN: textareas('SS', [
          'Which human-performance problem presented here at FloLabs interests you most?',
          'What data or evidence would you want before drawing conclusions about that problem?',
          'How could your current background contribute?',
        ]),
        ETHICAL_AND_LEGAL_RESEARCH_INTERN: textareas('EL', [
          "What legal or ethical issue did you identify from everything you've reviewed about us during the course of your application?",
          'Why do you consider it important?',
          'What information or sources would you investigate before forming a recommendation?',
        ]),
        ANIMAL_SCIENCE_AND_VETERINARY_RESEARCH_INTERN: textareas('AS', [
          'Which FloLabs project or research direction could apply to animal health or welfare?',
          'What would you want to investigate first?',
          'Which skill do you need to strengthen to contribute?',
        ]),
        BIOMEDICAL_ENGINEERING_INTERN: textareas('BM', [
          'Which FloLabs project could benefit from biomedical knowledge?',
          'What would you want to investigate first?',
          'Which skill do you need to strengthen to contribute?',
        ]),
        EDTECH_AND_INNOVATION_INTERN: textareas('ET', [
          'Which FloLabs program or product could you improve as a learning experience?',
          'What would you change first?',
          'Which skill do you need to strengthen to contribute?',
        ]),
        QUANTUM_ENGINEER_INTERN: textareas('QE', [
          'Which FloLabs problem or project could quantum methods help with?',
          'What would you want to investigate first?',
          'Which skill do you need to strengthen to contribute?',
        ]),
      },
    },
  },
  closingTitle: 'Closing question',
  closing: [
    { id: 'BC1', kind: 'radio', label: 'After seeing the work relevant to your program, are you still interested in moving forward?', required: true, options: STILL_INTERESTED, field: 'stillInterested' },
    textarea('BC1b', 'Your questions', { showIf: { questionId: 'BC1', equals: 'YES_WITH_QUESTIONS' } }),
  ],
};
