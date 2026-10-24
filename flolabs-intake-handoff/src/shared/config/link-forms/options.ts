import type { Option } from '../options';

// Choices of the Form 1-3 questions that feed typed Form Submission / Reference fields.
// Values = Twenty API values (docs/twenty-schema.md); labels have no commas, like Twenty's.

export const COMMITMENT_DURATIONS = [
  { value: 'UNDER_3_MONTHS', label: 'Under 3 months' },
  { value: 'MONTHS_3_TO_6', label: '3-6 months' },
  { value: 'MONTHS_6_TO_12', label: '6-12 months' },
  { value: 'OVER_12_MONTHS', label: 'Over 12 months' },
] as const satisfies readonly Option[];

export const STILL_INTERESTED = [
  { value: 'YES_DEFINITELY', label: 'Yes definitely' },
  { value: 'YES_WITH_QUESTIONS', label: 'Yes but I have questions' },
  { value: 'UNSURE', label: "I'm unsure" },
  { value: 'NO', label: 'No' },
] as const satisfies readonly Option[];

export const CAN_MEET_COMMITMENT = [
  { value: 'YES', label: 'Yes' },
  { value: 'NO', label: 'No' },
  { value: 'NEED_TO_DISCUSS', label: 'I need to discuss my availability' },
] as const satisfies readonly Option[];

export const KNOWN_DURATIONS = [
  { value: 'MONTHS_0_TO_6', label: '0-6 months' },
  { value: 'MONTHS_6_TO_12', label: '6-12 months' },
  { value: 'YEARS_1_TO_2', label: '1-2 years' },
  { value: 'YEARS_2_TO_3', label: '2-3 years' },
] as const satisfies readonly Option[];

/** Form 1 RO3 (Robotics track): tools used. Stored in `answers` only, so values are ours. */
export const ROBOTICS_TOOLS = [
  { value: 'ARDUINO', label: 'Arduino' },
  { value: 'ESP32', label: 'ESP32' },
  { value: 'RASPBERRY_PI', label: 'Raspberry Pi' },
  { value: 'MATLAB', label: 'MATLAB' },
  { value: 'SIMULINK', label: 'Simulink' },
  { value: 'ROS', label: 'ROS' },
  { value: 'C_CPP', label: 'C/C++' },
  { value: 'PYTHON', label: 'Python' },
  { value: 'SENSORS', label: 'Sensors' },
  { value: 'PCB_TOOLS', label: 'PCB tools' },
  { value: 'CAD', label: 'CAD' },
  { value: 'EEG', label: 'EEG' },
  { value: 'SIGNAL_PROCESSING', label: 'Signal processing' },
  { value: 'OTHER', label: 'Other' },
] as const satisfies readonly Option[];
