import type { Option } from './options';

// The one program-to-track map used everywhere (spec section 9, D0, D11).
// Program values/labels = live Twenty `Application.positionAppliedFor` options.

export const TRACKS = [
  { value: 'AI_SOFTWARE_ENGINEERING', label: 'AI & Software Engineering' },
  { value: 'ROBOTICS_INTELLIGENT_SYSTEMS', label: 'Robotics & Intelligent Systems' },
  { value: 'BUSINESS_GROWTH_ENTREPRENEURSHIP', label: 'Business Management, Growth & Entrepreneurship' },
  { value: 'DESIGN_TECHNICAL_COMMUNICATION', label: 'Design & Technical Communication' },
  { value: 'EMERGING_SCIENCES_TECHNOLOGY', label: 'Emerging Sciences & Technology' },
] as const satisfies readonly Option[];

export type TrackValue = (typeof TRACKS)[number]['value'];

export type Program = Option & { readonly track: TrackValue };

export const PROGRAMS = [
  // AI & Software Engineering (9)
  { value: 'AI_AGI_INTERN', label: 'AI/AGI Intern', track: 'AI_SOFTWARE_ENGINEERING' },
  { value: 'BACKEND_DEVELOPER_INTERN', label: 'Backend Developer Intern', track: 'AI_SOFTWARE_ENGINEERING' },
  { value: 'COMPUTER_VISION_ENGINEERING_INTERN', label: 'Computer Vision Engineering Intern', track: 'AI_SOFTWARE_ENGINEERING' },
  { value: 'FRONT_END_DEVELOPER_INTERN', label: 'Front-end Developer Intern', track: 'AI_SOFTWARE_ENGINEERING' },
  { value: 'MACHINE_LEARNING_ENGINEERING_INTERN', label: 'Machine Learning Engineering Intern', track: 'AI_SOFTWARE_ENGINEERING' },
  { value: 'PROMPT_ENGINEER_INTERN', label: 'Prompt Engineer Intern', track: 'AI_SOFTWARE_ENGINEERING' },
  { value: 'QUALITY_ASSURANCE_INTERN', label: 'Quality Assurance Intern', track: 'AI_SOFTWARE_ENGINEERING' },
  { value: 'RESEARCH_ASSOCIATE_INTERN_OPEN_SOURCE_PROJECTS', label: 'Research Associate Intern (Open-Source Projects)', track: 'AI_SOFTWARE_ENGINEERING' },
  { value: 'SOFTWARE_DEVELOPMENT_INTERN', label: 'Software Development Intern', track: 'AI_SOFTWARE_ENGINEERING' },

  // Robotics & Intelligent Systems (8)
  { value: 'CONTROL_SYSTEMS_ENGINEERING_INTERN', label: 'Control Systems Engineering Intern', track: 'ROBOTICS_INTELLIGENT_SYSTEMS' },
  { value: 'EMBEDDED_SYSTEMS_INTERN', label: 'Embedded Systems Intern', track: 'ROBOTICS_INTELLIGENT_SYSTEMS' },
  { value: 'HUMAN_ROBOT_INTERACTION_INTERN', label: 'Human-Robot Interaction Intern', track: 'ROBOTICS_INTELLIGENT_SYSTEMS' },
  { value: 'MECHATRONICS_ENGINEERING_INTERN', label: 'Mechatronics Engineering Intern', track: 'ROBOTICS_INTELLIGENT_SYSTEMS' },
  { value: 'PRODUCT_DEVELOPMENT_INTERN_AI_ROBOTICS', label: 'Product Development Intern (AI & Robotics)', track: 'ROBOTICS_INTELLIGENT_SYSTEMS' },
  { value: 'ROBOTICS_ENGINEERING_INTERN', label: 'Robotics Engineering Intern', track: 'ROBOTICS_INTELLIGENT_SYSTEMS' },
  { value: 'SENSOR_INTEGRATION_INTERN', label: 'Sensor Integration Intern', track: 'ROBOTICS_INTELLIGENT_SYSTEMS' },
  { value: 'NEUROSCIENCE_INTERN', label: 'Neuroscience Intern', track: 'ROBOTICS_INTELLIGENT_SYSTEMS' },

  // Business Management, Growth & Entrepreneurship (13)
  { value: 'BUSINESS_DEVELOPMENT_AND_SALES_INTERN_AI_AND_ROBOTICS', label: 'Business Development and Sales Intern (AI and Robotics)', track: 'BUSINESS_GROWTH_ENTREPRENEURSHIP' },
  { value: 'CONTENT_MARKETING_INTERN', label: 'Content Marketing Intern', track: 'BUSINESS_GROWTH_ENTREPRENEURSHIP' },
  { value: 'DIGITAL_MARKETING_INTERN', label: 'Digital Marketing Intern', track: 'BUSINESS_GROWTH_ENTREPRENEURSHIP' },
  { value: 'FINANCE_INTERN', label: 'Finance Intern', track: 'BUSINESS_GROWTH_ENTREPRENEURSHIP' },
  { value: 'GTM_ENGINEER_GO_TO_MARKET_ENGINEER_INTERN', label: 'GTM Engineer (Go-To-Market Engineer) Intern', track: 'BUSINESS_GROWTH_ENTREPRENEURSHIP' },
  { value: 'GTM_INFLUENCER_INTERN', label: 'GTM Influencer Intern', track: 'BUSINESS_GROWTH_ENTREPRENEURSHIP' },
  { value: 'HOSPITALITY_AND_TOURISM_INTERN', label: 'Hospitality and Tourism Intern', track: 'BUSINESS_GROWTH_ENTREPRENEURSHIP' },
  { value: 'MARKETING_INTERN', label: 'Marketing Intern', track: 'BUSINESS_GROWTH_ENTREPRENEURSHIP' },
  { value: 'OPERATIONS_INTERN', label: 'Operations Intern', track: 'BUSINESS_GROWTH_ENTREPRENEURSHIP' },
  { value: 'PODCAST_PRODUCTION_INTERN_POSITION', label: 'Podcast Production Intern Position', track: 'BUSINESS_GROWTH_ENTREPRENEURSHIP' },
  { value: 'PROJECT_MANAGEMENT_INTERN', label: 'Project Management Intern', track: 'BUSINESS_GROWTH_ENTREPRENEURSHIP' },
  { value: 'SEO_SPECIALIST_INTERN', label: 'SEO Specialist Intern', track: 'BUSINESS_GROWTH_ENTREPRENEURSHIP' },
  { value: 'SOCIAL_MEDIA_INTERN', label: 'Social Media Intern', track: 'BUSINESS_GROWTH_ENTREPRENEURSHIP' },

  // Design & Technical Communication (3)
  { value: 'JOURNALISM_PR_INTERN', label: 'Journalism & PR Intern', track: 'DESIGN_TECHNICAL_COMMUNICATION' },
  { value: 'TECHNICAL_WRITING_INTERN', label: 'Technical Writing Intern', track: 'DESIGN_TECHNICAL_COMMUNICATION' },
  { value: 'UI_UX_DESIGN_INTERN', label: 'UI/UX Design Intern', track: 'DESIGN_TECHNICAL_COMMUNICATION' },

  // Emerging Sciences & Technology (7)
  { value: 'ANIMAL_SCIENCE_AND_VETERINARY_RESEARCH_INTERN', label: 'Animal Science and Veterinary Research Intern', track: 'EMERGING_SCIENCES_TECHNOLOGY' },
  { value: 'BIOMEDICAL_ENGINEERING_INTERN', label: 'Biomedical Engineering Intern', track: 'EMERGING_SCIENCES_TECHNOLOGY' },
  { value: 'EDTECH_AND_INNOVATION_INTERN', label: 'EdTech and Innovation Intern', track: 'EMERGING_SCIENCES_TECHNOLOGY' },
  { value: 'ETHICAL_AND_LEGAL_RESEARCH_INTERN', label: 'Ethical and Legal Research Intern', track: 'EMERGING_SCIENCES_TECHNOLOGY' },
  { value: 'QUANTUM_ENGINEER_INTERN', label: 'Quantum Engineer Intern', track: 'EMERGING_SCIENCES_TECHNOLOGY' },
  { value: 'SPACE_SCIENCE_INTERN', label: 'Space Science Intern', track: 'EMERGING_SCIENCES_TECHNOLOGY' },
  { value: 'SPORT_SCIENCE_INTERN', label: 'Sport Science Intern', track: 'EMERGING_SCIENCES_TECHNOLOGY' },
] as const satisfies readonly Program[];

export type ProgramValue = (typeof PROGRAMS)[number]['value'];

export function trackOf(program: ProgramValue): TrackValue {
  return PROGRAMS.find((p) => p.value === program)!.track;
}

/** Distinct tracks for a set of programs, in track order (used by Forms 1/2 and the track statement). */
export function tracksOf(programs: readonly ProgramValue[]): TrackValue[] {
  const wanted = new Set(programs.map(trackOf));
  return TRACKS.map((t) => t.value).filter((t) => wanted.has(t));
}

/** Programs grouped by track, for the multi-select UI. */
export const PROGRAMS_BY_TRACK = TRACKS.map((track) => ({
  ...track,
  programs: PROGRAMS.filter((p) => p.track === track.value),
}));
