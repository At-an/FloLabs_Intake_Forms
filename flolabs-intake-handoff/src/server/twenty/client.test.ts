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

  it('finds a Person by id using a GraphQL variable', async () => {
    const person = { id: ID, name: { firstName: 'Jane', lastName: 'Doe' }, emails: { primaryEmail: EMAIL } };
    const { client, calls } = mockFetch(() => json({ data: { people: { edges: [{ node: person }] } } }));
    await expect(client.findPersonById(ID)).resolves.toEqual(person);
    expect(calls[0]!.body.variables).toEqual({ id: ID });
    expect(calls[0]!.body.query).not.toContain(ID);
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
      'createFormSubmission',
      'createInquiry',
      'createPerson',
      'createReference',
      'findApplicationBySubmissionKey',
      'findApplicationForLink',
      'findFormSubmissionBySubmissionKey',
      'findFormSubmissionFor',
      'findInquiryBySubmissionKey',
      'findPersonByEmail',
      'findPersonById',
      'findReferenceFor',
      'findSiteByKey',
      'updatePerson',
      'uploadFile',
    ]);
  });

  describe('uploadFile', () => {
    const bytes = new TextEncoder().encode('%PDF-1.4 test');
    const target = (uploadUrl: string) => ({
      data: { createFileUpload: { fileId: ID, uploadUrl, contentType: 'application/octet-stream' } },
    });

    function sequence(uploadUrl: string, putStatus = 204, baseUrl = BASE) {
      const seen: { url: string; method: string; body: unknown }[] = [];
      const responses = [json(target(uploadUrl)), new Response(null, { status: putStatus }), json({ data: { completeFileUpload: { id: ID } } })];
      const fetchImpl = vi.fn(async (url: string | URL | Request, init?: RequestInit) => {
        seen.push({ url: String(url), method: init!.method!, body: init!.body });
        return responses.shift()!;
      }) as unknown as typeof fetch;
      return { client: createTwentyClient({ baseUrl, apiKey: KEY, fetch: fetchImpl }), seen };
    }

    it('creates the target on /metadata, PUTs the bytes, then completes the upload', async () => {
      const { client, seen } = sequence('https://crm.example.com/file-upload/abc?token=signed');
      await expect(client.uploadFile({ filename: 'cv.pdf', bytes, fieldMetadataId: 'field-1' })).resolves.toEqual({ fileId: ID });
      expect(seen.map((s) => [s.method, s.url])).toEqual([
        ['POST', 'https://crm.example.com/metadata'],
        ['PUT', 'https://crm.example.com/file-upload/abc?token=signed'],
        ['POST', 'https://crm.example.com/metadata'],
      ]);
      expect(JSON.parse(String(seen[0]!.body)).variables).toEqual({ filename: 'cv.pdf', size: bytes.byteLength, fieldMetadataId: 'field-1' });
      expect(seen[1]!.body).toBe(bytes);
    });

    it('allows an R2 upload URL (storage on R2 after T6c-0)', async () => {
      const { client } = sequence('https://acct.r2.cloudflarestorage.com/bucket/key?X-Amz-Signature=x');
      await expect(client.uploadFile({ filename: 'cv.pdf', bytes, fieldMetadataId: 'f' })).resolves.toEqual({ fileId: ID });
    });

    it.each([
      'http://127.0.0.1:3000/file-upload/abc?token=signed',
      'https://acct.r2.cloudflarestorage.com/bucket/key?X-Amz-Signature=x',
    ])('with Twenty on this machine (http://127.0.0.1:3000), allows %s', async (uploadUrl) => {
      const { client, seen } = sequence(uploadUrl, 204, 'http://127.0.0.1:3000');
      await expect(client.uploadFile({ filename: 'cv.pdf', bytes, fieldMetadataId: 'f' })).resolves.toEqual({ fileId: ID });
      expect(seen[1]!.url).toBe(uploadUrl);
    });

    it.each(['http://127.0.0.1:4000/file-upload/abc', 'http://localhost:3000/file-upload/abc', 'http://acct.r2.cloudflarestorage.com/bucket/key'])(
      'with Twenty on this machine, refuses %s (another port, another host name, R2 without HTTPS)',
      async (uploadUrl) => {
        const { client, seen } = sequence(uploadUrl, 204, 'http://127.0.0.1:3000');
        await expect(client.uploadFile({ filename: 'cv.pdf', bytes, fieldMetadataId: 'f' })).rejects.toMatchObject({
          code: 'UNEXPECTED_UPLOAD_HOST',
        });
        expect(seen).toHaveLength(1);
      },
    );

    it.each(['https://evil.example.net/upload', 'http://crm.example.com/file-upload/abc', 'https://r2.cloudflarestorage.com.evil.io/x'])(
      'refuses to send the file to %s',
      async (uploadUrl) => {
        const { client, seen } = sequence(uploadUrl);
        await expect(client.uploadFile({ filename: 'cv.pdf', bytes, fieldMetadataId: 'f' })).rejects.toMatchObject({
          code: 'UNEXPECTED_UPLOAD_HOST',
        });
        expect(seen).toHaveLength(1);
      },
    );

    it('fails with a TwentyError when the PUT is rejected', async () => {
      const { client } = sequence('https://crm.example.com/file-upload/abc', 403);
      await expect(client.uploadFile({ filename: 'cv.pdf', bytes, fieldMetadataId: 'f' })).rejects.toMatchObject({
        op: 'twenty.uploadFile',
        status: 403,
      });
    });
  });
});
