import { beforeAll, describe, expect, it } from 'vitest';
import { createTwentyClient, TwentyError } from './client';

// Read-only checks against the live Twenty instance. Never writes records.
// Runs only when Twenty credentials are in the environment: `npm run test:live`
// loads them from .env.local; the default `npm test` does not, so it skips these.
const live = Boolean(process.env.TWENTY_BASE_URL && process.env.TWENTY_API_KEY);

describe.skipIf(!live)('Twenty client (live, read-only)', () => {
  let client: ReturnType<typeof createTwentyClient>;
  beforeAll(() => {
    client = createTwentyClient({ baseUrl: process.env.TWENTY_BASE_URL!, apiKey: process.env.TWENTY_API_KEY! });
  });

  it('finds the POC Site by its site key', async () => {
    const site = await client.findSiteByKey('flolabs_international');
    expect(site).toEqual({ id: 'f39c8196-db3d-41ee-bc58-abfecf43933d', siteId: 'flolabs_international', active: true });
  });

  it('looks up a person by an email containing filter-breaking characters without error', async () => {
    await expect(client.findPersonByEmail('t3-live+a,b)c"@example.invalid')).resolves.toBeNull();
  });

  it('looks up an Application by submission key', async () => {
    await expect(client.findApplicationBySubmissionKey('00000000-0000-4000-8000-000000000000')).resolves.toBeNull();
  });

  it('reports a rejected API key as a TwentyError', async () => {
    const bad = createTwentyClient({ baseUrl: process.env.TWENTY_BASE_URL!, apiKey: 'invalid-key-for-live-test' });
    const error = await bad.findSiteByKey('flolabs_international').catch((e: unknown) => e);
    expect(error).toBeInstanceOf(TwentyError);
  });
});
