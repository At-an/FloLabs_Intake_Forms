import type { FormConfig } from '../../forms/engine/types';
import { textarea, textareas } from './helpers';
import { COMMITMENT_DURATIONS, ROBOTICS_TOOLS } from './options';

// Form 1 (Contacted), T12. Existing question texts: docs/source "Template for first form";
// new program questions: spec section 8. Question ids follow the spec (G4..G13, AI1, ...).
// Bump `version` whenever a question text or rule changes (stored on every Form Submission).

const TECHNICAL_WRITING_SNIPPET =
  "To use the export you need to go to settings first but only if your an admin, otherwise ask one. Then the button for export which is at the bottom you click it and choose CSV or PDF (PDF dont work for big files over 50mb). It will email you. If it doesn't check spam or try again later maybe.";

export const CONTACTED_FORM: FormConfig = {
  formType: 'CONTACTED',
  version: 'contacted-v1',
  tracksStepTitle: 'Interest',
  intro: [
    textarea('G4', 'Why are you interested in this specific program?'),
    textarea('G5', 'What do you hope to learn or become capable of doing through this program?'),
    textarea('G6', 'Relevant education/background'),
    textarea('G7', 'Relevant experience, projects, portfolio, research, or coursework'),
    { id: 'G8', kind: 'number', label: 'How many hours per week can you realistically commit?', required: true, min: 1, max: 40, help: 'A whole number from 1 to 40.', field: 'hoursPerWeek' },
    { id: 'G9', kind: 'select', label: 'How long can you maintain that commitment?', required: true, options: COMMITMENT_DURATIONS, field: 'commitmentDuration' },
    { id: 'G10', kind: 'links', label: 'Portfolio/GitHub/LinkedIn/website, where relevant', required: false, maxItems: 3 },
    { id: 'G11', kind: 'yesno', label: 'Are you comfortable working remotely and collaborating with a team?', required: true, field: 'remoteOk' },
    { id: 'G12', kind: 'yesno', label: 'Are you able to attend the required meetings associated with your program?', required: true, field: 'canAttendMeetings' },
    textarea('G13', 'Anything else relevant to your application?', { required: false }),
  ],
  tracks: {
    AI_SOFTWARE_ENGINEERING: {
      trackWide: textareas('AI', [
        'Tell us about the most technically challenging software, AI, or computational project you have worked on. What was your own contribution?',
        'What programming languages, frameworks, platforms, or development tools are you currently comfortable using?',
        'When you encounter a technical problem you do not know how to solve, how do you normally approach it?',
      ]),
      programs: {
        AI_AGI_INTERN: textareas('AGI', ['What area of artificial intelligence currently interests you most, and what would you like to build or investigate in that area?']),
        MACHINE_LEARNING_ENGINEERING_INTERN: textareas('ML', ['Describe any experience you have working with datasets, training models, evaluating models, or implementing ML systems.']),
        COMPUTER_VISION_ENGINEERING_INTERN: textareas('CV', ['Have you previously worked with images, video, object detection, classification, segmentation, tracking, or related computer-vision problems? Briefly explain.']),
        FRONT_END_DEVELOPER_INTERN: textareas('FE', ['Share one interface you have built. What decisions did you make around usability, responsiveness, accessibility, or performance?']),
        BACKEND_DEVELOPER_INTERN: textareas('BE', ['Describe your experience with APIs, databases, authentication, server-side applications, or cloud infrastructure.']),
        SOFTWARE_DEVELOPMENT_INTERN: textareas('SD', ['Describe a software project you have taken from an idea or requirement to a working implementation.']),
        PROMPT_ENGINEER_INTERN: textareas('PE', [
          'Which AI models or tools have you used to write and test prompts?',
          'Share one prompt you wrote and the result it produced.',
          "How do you check whether an AI's answer is correct?",
        ]),
        QUALITY_ASSURANCE_INTERN: textareas('QA', [
          'What types of testing have you done (manual, automated, API, UI)?',
          'Which testing tools have you used?',
          'Describe one bug you found and how you reported it.',
        ]),
        RESEARCH_ASSOCIATE_INTERN_OPEN_SOURCE_PROJECTS: textareas('RA', [
          'Have you contributed to an open-source project? Share a link if possible.',
          'Which AI or software research topic interests you most?',
          'Name one paper or technical article you read recently and what you learned from it.',
        ]),
      },
    },
    ROBOTICS_INTELLIGENT_SYSTEMS: {
      trackWide: [
        textarea('RO1', 'What interests you about intelligent physical systems, robotics, or human-machine interaction?'),
        textarea('RO2', 'Describe one hardware, robotics, electronics, simulation, engineering, neuroscience, or technical project you have worked on.'),
        { id: 'RO3', kind: 'multiselect', label: 'Which tools or technologies have you used?', required: true, options: ROBOTICS_TOOLS, help: 'Choose all that apply.' },
        { id: 'RO3b', kind: 'text', label: 'Which other tools or technologies?', required: true, maxLength: 300, showIf: { questionId: 'RO3', includes: 'OTHER' } },
      ],
      programs: {
        CONTROL_SYSTEMS_ENGINEERING_INTERN: textareas('CS', ['Describe your understanding or experience with feedback, control, modelling, simulation, or autonomous systems.']),
        EMBEDDED_SYSTEMS_INTERN: textareas('ES', ['What experience do you have working with microcontrollers, sensors, communication protocols, electronics, or firmware?']),
        // D10: the "AI & Robotics Product Development" question goes to this program.
        PRODUCT_DEVELOPMENT_INTERN_AI_ROBOTICS: textareas('PD', ['If you were helping develop an AI-enabled physical product, what factors would you consider before deciding what to build?']),
        NEUROSCIENCE_INTERN: textareas('NS', ['Which area interests you most: neural signals, neurotechnology, cognition, human performance, brain-computer interfaces, or human-robot interaction? Why?']),
        ROBOTICS_ENGINEERING_INTERN: textareas('RE', [
          'Describe a robot you have built, programmed, or simulated.',
          'Which robotics tools have you used (for example ROS, Gazebo, MoveIt)?',
          'What was the hardest problem in that project, and how did you solve it?',
        ]),
        HUMAN_ROBOT_INTERACTION_INTERN: textareas('HRI', [
          'What interests you about how people interact with robots?',
          'Describe a project or study involving users and a robot, device, or interface.',
          'Which methods have you used to test how people use a system (surveys, interviews, user tests)?',
        ]),
        MECHATRONICS_ENGINEERING_INTERN: textareas('MT', [
          'Describe a project that combined mechanical, electrical, and software parts.',
          'Which CAD, electronics, or programming tools have you used?',
          'Which part of that project did you build yourself?',
        ]),
        SENSOR_INTEGRATION_INTERN: textareas('SI', [
          'Which sensors have you worked with (for example IMU, camera, LiDAR, temperature)?',
          'Describe how you connected a sensor to a system and read its data.',
          'How did you handle noisy or incorrect sensor readings?',
        ]),
      },
    },
    BUSINESS_GROWTH_ENTREPRENEURSHIP: {
      trackWide: textareas('BU', [
        'Tell us about a project, organization, campaign, business, or initiative where you helped produce a measurable outcome.',
        'What does success look like in the type of work you are applying to do?',
      ]),
      programs: {
        BUSINESS_DEVELOPMENT_AND_SALES_INTERN_AI_AND_ROBOTICS: textareas('BD', ['Pick one AI or robotics product. Who would you sell it to, what problem would it solve, and how would you approach the customer?']),
        MARKETING_INTERN: textareas('MK', ['Choose a product you understand well. Who is its target audience and how would you position it?']),
        DIGITAL_MARKETING_INTERN: textareas('DM', ['Which digital channels would you prioritize for a new technology product and why?']),
        CONTENT_MARKETING_INTERN: textareas('CM', ['Show us one piece of content you are proud of, or describe how you would turn a complex product idea into useful content.']),
        GTM_INFLUENCER_INTERN: textareas('GI', ['Imagine you are introducing a new AI or robotics product to a community unfamiliar with it. How would you generate initial interest and trust?']),
        SEO_SPECIALIST_INTERN: textareas('SEO', ['If a technically strong website receives little organic search traffic, what would you investigate first?']),
        SOCIAL_MEDIA_INTERN: textareas('SM', ['Choose one platform and explain how you would adapt content to its audience and format.']),
        PROJECT_MANAGEMENT_INTERN: textareas('PM', ['Describe a project involving multiple people. How would you keep responsibilities, dependencies, timelines, and blockers visible?']),
        OPERATIONS_INTERN: textareas('OP', ['Describe a recurring process you would improve. What would you measure before and after making changes?']),
        FINANCE_INTERN: textareas('FI', [
          'What finance, accounting, or budgeting experience do you have?',
          'Which tools have you used (for example Excel, Google Sheets, QuickBooks)?',
          'Describe one financial analysis or report you have prepared.',
        ]),
        GTM_ENGINEER_GO_TO_MARKET_ENGINEER_INTERN: textareas('GE', [
          'Which sales or marketing tools have you used or automated (for example a CRM, email tools, Zapier, n8n)?',
          'Describe a workflow you built to find, contact, or track customers.',
          'Which programming or scripting skills do you have?',
        ]),
        HOSPITALITY_AND_TOURISM_INTERN: textareas('HT', [
          'What hospitality, tourism, or customer-service experience do you have?',
          "Describe a time you improved a guest's or customer's experience.",
          'Which area interests you most: hotels, travel, events, or food service?',
        ]),
        PODCAST_PRODUCTION_INTERN_POSITION: textareas('PP', [
          'Have you produced, edited, or hosted a podcast or video? Share a link if possible.',
          'Which audio or video tools have you used?',
          'Which part of production do you enjoy most: research, recording, editing, or promotion?',
        ]),
      },
    },
    DESIGN_TECHNICAL_COMMUNICATION: {
      trackWide: [],
      programs: {
        UI_UX_DESIGN_INTERN: [
          { id: 'DE1', kind: 'links', label: 'Link your portfolio or provide examples of previous design work.', required: true, maxItems: 3 },
          textarea('DE2', 'Pick one digital product you use regularly. What is one user-experience problem you would improve and why?'),
          textarea('DE3', 'Briefly describe how you normally move from understanding a problem to creating a design.'),
        ],
        TECHNICAL_WRITING_INTERN: [
          { id: 'TW1', kind: 'links', label: 'Provide a writing or documentation sample.', required: true, maxItems: 3, help: 'Add a link to your sample (for example Google Docs, GitHub or a blog post).' },
          textarea('TW2', 'Imagine you need to explain a technically complex feature to a non-technical user. How would you approach it?'),
          { id: 'TW3_SNIPPET', kind: 'display', text: TECHNICAL_WRITING_SNIPPET },
          textarea('TW3', 'Rewrite the short piece of poorly structured product documentation above.'),
        ],
        JOURNALISM_PR_INTERN: textareas('JP', [
          'Share a link to an article, press release, or story you wrote.',
          'What writing, reporting, or media experience do you have?',
          'How do you check that the facts in your writing are correct?',
        ]),
      },
    },
    EMERGING_SCIENCES_TECHNOLOGY: {
      trackWide: [],
      programs: {
        SPACE_SCIENCE_INTERN: textareas('SP', [
          'Which area of space science or technology interests you most, and why?',
          'Describe a research question, technical problem, mission, or development in space science that you find important.',
          'What research, analytical, computational, engineering, or scientific skills could you contribute?',
        ]),
        SPORT_SCIENCE_INTERN: textareas('SS', [
          'Which area of sport science or human performance interests you most?',
          'Describe a question related to athlete performance, recovery, biomechanics, physiology, monitoring, or training that you would like to investigate.',
          'What experience do you have with research, data, athletics, health technology, or human-performance analysis?',
        ]),
        ETHICAL_AND_LEGAL_RESEARCH_INTERN: textareas('EL', [
          'Identify one legal or ethical challenge created by AI or another emerging technology that you believe deserves deeper research.',
          'How would you approach researching an issue where law, technology, and ethics may point toward different conclusions?',
          'Describe any previous research, academic writing, legal analysis, policy work, or ethics-related experience.',
        ]),
        ANIMAL_SCIENCE_AND_VETERINARY_RESEARCH_INTERN: textareas('AS', [
          'Which area interests you most: animal health, nutrition, behaviour, or welfare?',
          'What experience do you have working with animals, in a lab, or in the field?',
          'Describe any research or coursework you have done in this area.',
        ]),
        BIOMEDICAL_ENGINEERING_INTERN: textareas('BM', [
          'Which area interests you most: medical devices, biosensors, imaging, or health data?',
          'Describe a biomedical project or coursework you have done.',
          'Which tools have you used (for example MATLAB, Python, CAD, lab equipment)?',
        ]),
        EDTECH_AND_INNOVATION_INTERN: textareas('ET', [
          'What experience do you have in teaching, tutoring, or creating learning content?',
          'Which learning platforms or tools have you used or built?',
          'Describe one learning problem you would like to solve with technology.',
        ]),
        QUANTUM_ENGINEER_INTERN: textareas('QE', [
          'Which area of quantum technology interests you most?',
          'What coursework or self-study have you done in quantum mechanics or quantum computing?',
          'Which quantum tools have you used (for example Qiskit, Cirq, PennyLane)?',
        ]),
      },
    },
  },
  closingTitle: 'Closing question',
  closing: [
    textarea(
      'C1',
      'After reviewing the information specific to your program, what part of the program interests you most, and is there anything you discovered that makes you uncertain about whether this opportunity is right for you?',
    ),
  ],
};
