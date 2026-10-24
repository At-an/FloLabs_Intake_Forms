import { describe, expect, it } from 'vitest';
import { PROGRAMS } from '@/shared/config/programs';
import { SOURCES } from '@/shared/config/sources';

// Fails if the form config drifts from the live Twenty options (plan T4, CLAUDE.md rule 8).
// Read-only. Runs only with Twenty credentials (`npm run test:live`).
const base = process.env.TWENTY_BASE_URL?.replace(/\/+$/, '');
const key = process.env.TWENTY_API_KEY;
const live = Boolean(base && key);

async function liveOptions(fieldName: string): Promise<{ value: string; label: string }[]> {
  const res = await fetch(`${base}/metadata`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      query: `{ objects(paging: { first: 200 }) { edges { node { nameSingular
        fields(paging: { first: 500 }) { edges { node { name options } } } } } } }`,
    }),
  });
  const body = await res.json();
  const application = body.data.objects.edges.find((e: { node: { nameSingular: string } }) => e.node.nameSingular === 'application');
  const field = application.node.fields.edges.find((e: { node: { name: string } }) => e.node.name === fieldName);
  return field.node.options.map(({ value, label }: { value: string; label: string }) => ({ value, label }));
}

const byValue = (list: { value: string; label: string }[]) => [...list].sort((a, b) => a.value.localeCompare(b.value));

describe.skipIf(!live)('form config vs live Twenty options', () => {
  it('every program value exists in Application.positionAppliedFor, with the same label', async () => {
    const options = await liveOptions('positionAppliedFor');
    expect(byValue(PROGRAMS.map(({ value, label }) => ({ value, label })))).toEqual(byValue(options));
  });

  it('every source value exists in Application.source, with the same label and order', async () => {
    const options = await liveOptions('source');
    expect(SOURCES.map(({ value, label }) => ({ value, label }))).toEqual(options);
  });
});
