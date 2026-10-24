import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { COUNTRIES, countryName, isCountryCode } from './countries';
import { labelOf } from './options';
import { PROGRAMS, PROGRAMS_BY_TRACK, TRACKS, trackOf, tracksOf } from './programs';
import { SOURCES } from './sources';

// Offline check against the latest schema snapshot; the live check is options.live.test.ts.
const snapshot = JSON.parse(
  readFileSync(new URL('../../../docs/snapshots/twenty-schema-2026-10-24-t2a.json', import.meta.url), 'utf8'),
) as { objects: { application: { fields: { name: string; options?: { value: string; label: string }[] }[] } } };
const snapshotOptions = (field: string) =>
  snapshot.objects.application.fields.find((f) => f.name === field)!.options!.map(({ value, label }) => ({ value, label }));
const sortByValue = <T extends { value: string }>(list: T[]) => [...list].sort((a, b) => a.value.localeCompare(b.value));

describe('programs and tracks', () => {
  it('has 40 unique programs', () => {
    expect(PROGRAMS).toHaveLength(40);
    expect(new Set(PROGRAMS.map((p) => p.value)).size).toBe(40);
  });

  it('assigns every program to one of the 5 tracks with the spec counts (9/8/13/3/7)', () => {
    expect(PROGRAMS_BY_TRACK.map((t) => [t.value, t.programs.length])).toEqual([
      ['AI_SOFTWARE_ENGINEERING', 9],
      ['ROBOTICS_INTELLIGENT_SYSTEMS', 8],
      ['BUSINESS_GROWTH_ENTREPRENEURSHIP', 13],
      ['DESIGN_TECHNICAL_COMMUNICATION', 3],
      ['EMERGING_SCIENCES_TECHNOLOGY', 7],
    ]);
    expect(TRACKS).toHaveLength(5);
  });

  it('matches the Twenty positionAppliedFor options exactly (values and labels)', () => {
    const config = PROGRAMS.map(({ value, label }) => ({ value, label }));
    expect(sortByValue(config)).toEqual(sortByValue(snapshotOptions('positionAppliedFor')));
  });

  it('finds the track of a program and the distinct tracks of a cross-track applicant', () => {
    expect(trackOf('NEUROSCIENCE_INTERN')).toBe('ROBOTICS_INTELLIGENT_SYSTEMS');
    expect(tracksOf(['UI_UX_DESIGN_INTERN', 'FINANCE_INTERN', 'MARKETING_INTERN', 'AI_AGI_INTERN'])).toEqual([
      'AI_SOFTWARE_ENGINEERING',
      'BUSINESS_GROWTH_ENTREPRENEURSHIP',
      'DESIGN_TECHNICAL_COMMUNICATION',
    ]);
  });
});

describe('sources', () => {
  it('matches the Twenty source options exactly, in Twenty order, with Other last', () => {
    expect(SOURCES.map(({ value, label }) => ({ value, label }))).toEqual(snapshotOptions('source'));
    expect(SOURCES).toHaveLength(26);
    expect(SOURCES.at(-1)!.value).toBe('OTHER');
  });

  it('maps values to labels for display', () => {
    expect(labelOf(SOURCES, 'X_TWITTER')).toBe('X (Twitter)');
  });
});

describe('countries', () => {
  it('lists ISO codes with English names and calling codes, sorted by name', () => {
    expect(COUNTRIES.length).toBeGreaterThan(200);
    expect(COUNTRIES.find((c) => c.value === 'CM')).toEqual({ value: 'CM', label: 'Cameroon', callingCode: '+237' });
    const labels = COUNTRIES.map((c) => c.label);
    expect(labels).toEqual([...labels].sort((a, b) => a.localeCompare(b, 'en')));
  });

  it('validates codes and gives the country name', () => {
    expect(isCountryCode('US')).toBe(true);
    expect(isCountryCode('XX')).toBe(false);
    expect(countryName('US')).toBe('United States');
  });
});
