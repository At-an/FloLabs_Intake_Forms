import { getCountries, getCountryCallingCode, type CountryCode } from 'libphonenumber-js';
import type { Option } from './options';

// Countries for the Country/Region select and the phone country code.
// Value = ISO 3166-1 alpha-2 code; label = English name. The Twenty ADDRESS format
// (name vs code) is confirmed with a test write in T5; `countryName` gives the name.

const regionNames = new Intl.DisplayNames(['en'], { type: 'region' });

export type CountryOption = Option<CountryCode> & { readonly callingCode: string };

export const COUNTRIES: readonly CountryOption[] = getCountries()
  .map((code) => ({
    value: code,
    label: regionNames.of(code) ?? code,
    callingCode: `+${getCountryCallingCode(code)}`,
  }))
  .sort((a, b) => a.label.localeCompare(b.label, 'en'));

const COUNTRY_CODES: ReadonlySet<string> = new Set(COUNTRIES.map((c) => c.value));

export const isCountryCode = (value: string): value is CountryCode => COUNTRY_CODES.has(value);

export const countryName = (code: CountryCode): string => regionNames.of(code) ?? code;
