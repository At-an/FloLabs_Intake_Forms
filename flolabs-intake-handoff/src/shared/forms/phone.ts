import { parsePhoneNumberFromString, type CountryCode } from 'libphonenumber-js';
import { z } from 'zod';
import { isCountryCode } from '../config/countries';

// Phone schemas shared by the Application form (required) and the Form 3 references (optional).
// Output = the parts Twenty's PHONES field stores: national number + ISO country + calling code.

export const countryCode = (message: string) =>
  z.string(message).refine(isCountryCode, message).transform((value) => value as CountryCode);

export type ParsedPhone = { e164: string; countryCode: CountryCode; callingCode: string; nationalNumber: string };

function parsePhone(number: string, country: CountryCode, ctx: z.RefinementCtx): ParsedPhone {
  const phone = parsePhoneNumberFromString(number, country);
  if (!phone?.isValid()) {
    ctx.addIssue({ code: 'custom', path: ['number'], message: 'Enter a valid phone number for the chosen country.' });
    return z.NEVER;
  }
  return { e164: phone.number, countryCode: country, callingCode: `+${phone.countryCallingCode}`, nationalNumber: phone.nationalNumber };
}

// Checked on its own (not in an object-level refinement) so its error shows even while
// other fields are still empty: Zod skips object refinements after type errors elsewhere.
const phoneField = z
  .object({
    country: countryCode('Choose the country code for your phone number.'),
    number: z.string('Enter your phone number.').trim().min(1, 'Enter your phone number.').max(30, 'This phone number is too long.'),
  })
  .transform(({ country, number }, ctx) => parsePhone(number, country, ctx));

/** Required phone. A missing phone object gets the same message as an empty number. */
export const phoneInput = z.looseObject({}, 'Enter your phone number.').pipe(phoneField);

/** Optional phone: an empty number means no phone; a filled one needs a country and must be valid. */
export const optionalPhoneInput = z
  .object({
    country: z.string('Choose the country code for this phone number.').optional(),
    number: z.string('Enter a phone number, or leave it empty.').trim().max(30, 'This phone number is too long.').optional(),
  })
  .optional()
  .transform((value, ctx): ParsedPhone | undefined => {
    if (!value?.number) return undefined;
    if (!value.country || !isCountryCode(value.country)) {
      ctx.addIssue({ code: 'custom', path: ['country'], message: 'Choose the country code for this phone number.' });
      return z.NEVER;
    }
    return parsePhone(value.number, value.country, ctx);
  });
