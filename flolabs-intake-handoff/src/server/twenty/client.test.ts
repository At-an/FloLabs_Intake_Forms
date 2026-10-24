import { describe, expect, it, vi } from 'vitest';
import { createTwentyClient, TwentyError } from './client';
import type { ApplicationInput } from './types';

const BASE = 'https://crm.example.com/';
const KEY = 'test-api-key-0123456789abcdef';
const EMAIL = 'jane.doe+test@example.com';
const ID = '3f2b8c1e-9a4d-4e7f-8b2a-1c5d6e7f8a9b';

type Call = { url: string; init: RequestInit; body: { query: string; variables: Record<string, unknown> } };

function mockFetch(respond: () => Response | Promise<Response>) {
  const calls: Call[] = [];
  const fetchImpl = vi.fn(async (url: string | URL | Request, init?: RequestInit) => {
    calls.push({ url: String(url), init: init!, body: JSON.parse(String(init!.body)) });
    return respond();
  }) as unknown as typeof fetch;
  return { client: createTwentyClient({ baseUrl: BASE, apiKey: KEY, fetch: fetchImpl }), calls };
}

const json = (data: unknown, status = 200) =>
  new Response(JSON.stringify(data), { status, headers: { 'Content-Type': 'application/json' } });

describe('Twenty client', () => {
  it('posts to /graphql with the API key and passes the email as a variable, not in the query', async () => {
    const { client, calls } = mockFetch(() => json({ data: { people: { edges: [] } } }));
    await client.findPersonByEmail(EMAIL);

    expect(calls).toHaveLength(1);
    expect(calls[0]!.url).toBe('https://crm.example.com/graphql');
    expect(calls[0]!.init.method).toBe('POST');
    expect((calls[0]!.init.headers as Record<string, string>).Authorization).toBe(`Bearer ${KEY}`);
    expect(calls[0]!.body.query).not.toContain(EMAIL);
    expect(calls[0]!.body.variables).toEqual({ email: EMAIL });
  });

  it('returns null when no person matches and the record when one does', async () => {
    const person = { id: ID, name: { firstName: 'Jane', lastName: 'Doe' }, emails: { primaryEmail: EMAIL } };
    const empty = mockFetch(() => json({ data: { people: { edges: [] } } }));
    const found = mockFetch(() => json({ data: { people: { edges: [{ node: person }] } } }));

    await expect(empty.client.findPersonByEmail(EMAIL)).resolves.toBeNull();
    await expect(found.client.findPersonByEmail(EMAIL)).resolves.toEqual(person);
  });

  it('finds a Site by its site key', async () => {
    const site = { id: ID, siteId: 'flolabs_international', active: true };
    const { client, calls } = mockFetch(() => json({ data: { sites: { edges: [{ node: site }] } } }));
    await expect(client.findSiteByKey('flolabs_international')).resolves.toEqual(site);
    expect(calls[0]!.body.variables).toEqual({ siteKey: 'flolabs_international' });
  });

  it('creates an Application and returns its id', async () => {
    const input: ApplicationInput = {
      personId: ID,
      siteId: ID,
      siteStatus: 'KNOWN',
      submissionKey: ID,
      positionAppliedFor: ['UI_UX_DESIGN_INTERN'],
      source: 'REFERRAL',
      referralName: 'A. Friend',
      safeSenderConfirmed: true,
      submittedAt: '2026-10-24T10:00:00.000Z',
      sourceFormId: 'application',
      formVersion: '1',
    };
    const { client, calls } = mockFetch(() => json({ data: { createApplication: { id: ID } } }));
    await expect(client.createApplication(input)).resolves.toEqual({ id: ID });
    expect(calls[0]!.body.variables).toEqual({ data: input });
  });

  it('updates a Person by id', async () => {
    const { client, calls } = mockFetch(() => json({ data: { updatePerson: { id: ID } } }));
    await client.updatePerson(ID, { education: 'BSc Design' });
    expect(calls[0]!.body.variables).toEqual({ id: ID, data: { education: 'BSc Design' } });
  });

  it('throws a TwentyError with the HTTP status, without upstream text or input', async () => {
    const { client } = mockFetch(() => json({ messages: [`no access for ${EMAIL}`] }, 403));
    const error = await client.findPersonByEmail(EMAIL).catch((e: unknown) => e);
    expect(error).toBeInstanceOf(TwentyError);
    expect(error).toMatchObject({ op: 'twenty.findPersonByEmail', status: 403, code: 'HTTP_403' });
    expect((error as Error).message).not.toContain(EMAIL);
  });

  it('maps GraphQL errors to their extension code and drops the message', async () => {
    const { client } = mockFetch(() =>
      json({ data: null, errors: [{ message: `duplicate ${EMAIL}`, extensions: { code: 'BAD_USER_INPUT' } }] }),
    );
    const error = await client.createPerson({ emails: { primaryEmail: EMAIL } }).catch((e: unknown) => e);
    expect(error).toMatchObject({ op: 'twenty.createPerson', code: 'BAD_USER_INPUT' });
    expect((error as Error).message).not.toContain(EMAIL);
  });

  it('reports network failures and timeouts as codes', async () => {
    const network = mockFetch(() => Promise.reject(new TypeError('fetch failed')));
    const timeout = mockFetch(() => Promise.reject(new DOMException('timed out', 'TimeoutError')));
    await expect(network.client.findSiteByKey('x')).rejects.toMatchObject({ code: 'NETWORK', status: 0 });
    await expect(timeout.client.findSiteByKey('x')).rejects.toMatchObject({ code: 'TIMEOUT', status: 0 });
  });

  it('exposes named operations only', () => {
    const { client } = mockFetch(() => json({ data: {} }));
    expect(Object.keys(client).sort()).toEqual([
      'createApplication',
      'createPerson',
      'findApplicationBySubmissionKey',
      'findPersonByEmail',
      'findSiteByKey',
      'updatePerson',
    ]);
  });
});
