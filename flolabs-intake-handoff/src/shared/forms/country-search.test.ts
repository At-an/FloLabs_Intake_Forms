import { describe, expect, it } from 'vitest';
import { COUNTRIES } from '../config/countries';
import { searchCountries } from './country-search';

const values = (query: string) => searchCountries(COUNTRIES, query).map((c) => c.value);

describe('searchCountries (phone country code picker)', () => {
  it('returns every country for an empty query', () => {
    expect(searchCountries(COUNTRIES, '  ')).toHaveLength(COUNTRIES.length);
  });

  it('finds a country by part of its name, ignoring case and accents, names that start with it first', () => {
    expect(values('cameroon')).toEqual(['CM']);
    expect(values('CAM')[0]).toBe('KH'); // Cambodia, then Cameroon
    expect(values('cam')).toContain('CM');
    expect(values('cote')).toContain('CI');
    expect(values('united')).toEqual(expect.arrayContaining(['AE', 'GB', 'US']));
  });

  it('finds countries by calling code, with or without +', () => {
    expect(values('+237')).toEqual(['CM']);
    expect(values('237')).toEqual(['CM']);
    const plusOne = values('+1');
    expect(plusOne).toEqual(expect.arrayContaining(['CA', 'US']));
    expect(new Set(searchCountries(COUNTRIES, '+1').map((c) => c.callingCode))).toEqual(new Set(['+1']));
    expect(values('+21')).toEqual(expect.arrayContaining(['DZ', 'MA', 'TN'])); // +213, +212, +216
    expect(values('+44')).toEqual(expect.arrayContaining(['GB']));
  });

  it('finds a country by its two-letter code', () => {
    expect(values('ng')[0]).toBe('NG');
  });

  it('returns nothing for text that matches no country', () => {
    expect(values('zzzz')).toEqual([]);
    expect(values('+999999')).toEqual([]);
  });
});
