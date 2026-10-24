import type { Option } from './options';

// "How did you hear about us?" (spec D15): single choice, live Twenty `Application.source` options,
// in the order Twenty shows them. OTHER requires sourceDetail; REFERRAL requires referralName.
export const SOURCES = [
  { value: 'INDEED_COM', label: 'Indeed' },
  { value: 'GLASSDOOR_COM', label: 'Glassdoor' },
  { value: 'GOOGLE_COM', label: 'Google' },
  { value: 'FACEBOOK_COM', label: 'Facebook' },
  { value: 'INSTAGRAM_COM', label: 'Instagram' },
  { value: 'LINKEDIN_COM', label: 'LinkedIn' },
  { value: 'SIMPLYHIRED_COM', label: 'SimplyHired' },
  { value: 'NORTHEASTERN_UNIVERSITY_S_INTERNAL_JOB_PORTAL', label: "Northeastern University's Internal Job Portal" },
  { value: 'AUSTIN_COMMUNITY_COLLEGE', label: 'Austin Community College' },
  { value: 'TEXAS_A_M_UNIVERSITY_CORPUS_CHRISTI', label: 'Texas A&M University-Corpus Christi' },
  { value: 'TEXAS_A_M_UNIVERSITY_KINGSVILLE', label: 'Texas A&M University-Kingsville' },
  { value: 'JACKSON_COLLEGE', label: 'Jackson College' },
  { value: 'PURDUE_NORTHWEST', label: 'Purdue Northwest' },
  { value: 'CENTRAL_GEORGIA_TECHNICAL_COLLEGE', label: 'Central Georgia Technical College' },
  { value: 'HANDSHAKE', label: 'Handshake' },
  { value: 'ALABAMA_STATE_UNIVERSITY', label: 'Alabama State University' },
  { value: 'WORK_UA', label: 'Work.ua' },
  { value: 'TIKTOK', label: 'TikTok' },
  { value: 'REDDIT', label: 'Reddit' },
  { value: 'YOUTUBE', label: 'YouTube' },
  { value: 'X_TWITTER', label: 'X (Twitter)' },
  { value: 'COMPANY_WEBSITE', label: 'Company Website' },
  { value: 'JOB_BOARD', label: 'Job Board' },
  { value: 'EVENT', label: 'Event' },
  { value: 'REFERRAL', label: 'Referral' },
  { value: 'OTHER', label: 'Other' },
] as const satisfies readonly Option[];

export type SourceValue = (typeof SOURCES)[number]['value'];
