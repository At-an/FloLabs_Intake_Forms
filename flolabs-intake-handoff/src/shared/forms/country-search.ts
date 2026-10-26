// Search for the phone country code picker: by country name ("cam", "côte"), calling code
// ("+237", "237") or ISO code ("CM"). Accents and case are ignored.

export type SearchableCountry = { value: string; label: string; callingCode: string };

const normalize = (text: string) =>
  text
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .trim();

export function searchCountries<T extends SearchableCountry>(countries: readonly T[], query: string): T[] {
  const q = normalize(query);
  if (!q) return [...countries];

  const digits = q.replace(/^\+/, '').replace(/[\s-]/g, '');
  // A calling code: every country whose code starts with the digits typed so far.
  if (/^\d+$/.test(digits)) return countries.filter((c) => c.callingCode.slice(1).startsWith(digits));

  const byName = countries.filter((c) => normalize(c.label).includes(q));
  const starts = byName.filter((c) => normalize(c.label).startsWith(q));
  const iso = q.length === 2 ? countries.filter((c) => c.value.toLowerCase() === q && !byName.includes(c)) : [];
  return [...iso, ...starts, ...byName.filter((c) => !starts.includes(c))];
}
