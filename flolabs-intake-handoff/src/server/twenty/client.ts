import 'server-only';
import type { ApplicationInput, ApplicationRef, Person, PersonInput, Site } from './types';

// Purpose-built Twenty client (CLAUDE.md rule 3): named operations only, no generic proxy.
// All values travel as GraphQL variables; the REST filter syntax breaks on characters
// like ')' and ',' even when quoted (verified in T3), so it is not used for lookups.

export class TwentyError extends Error {
  constructor(
    readonly op: string,
    readonly status: number,
    readonly code: string,
  ) {
    // Never include the upstream message or request data: either may echo personal data.
    super(`Twenty operation ${op} failed (${code})`);
    this.name = 'TwentyError';
  }
}

export type TwentyClientOptions = {
  baseUrl: string;
  apiKey: string;
  fetch?: typeof fetch;
  timeoutMs?: number;
};

type Connection<T> = { edges: { node: T }[] };

const PERSON_FIELDS = `
  id
  name { firstName lastName }
  emails { primaryEmail additionalEmails }
  phones { primaryPhoneNumber primaryPhoneCountryCode primaryPhoneCallingCode additionalPhones }
  location { addressStreet1 addressStreet2 addressCity addressState addressPostcode addressCountry addressLat addressLng }
  linkedinLink { primaryLinkUrl primaryLinkLabel secondaryLinks }
  education
`;

// File bytes may only go to Twenty itself or, once its storage is on R2 (T6c-0), to R2.
const R2_HOST = /\.r2\.cloudflarestorage\.com$/;
const UPLOAD_TIMEOUT_MS = 30_000;

export function createTwentyClient({ baseUrl, apiKey, fetch: fetchImpl = fetch, timeoutMs = 10_000 }: TwentyClientOptions) {
  const root = baseUrl.replace(/\/+$/, '');
  const twentyOrigin = new URL(root).origin;

  async function request<T>(
    op: string,
    query: string,
    variables: Record<string, unknown>,
    path: '/graphql' | '/metadata' = '/graphql',
  ): Promise<T> {
    let response: Response;
    try {
      response = await fetchImpl(`${root}${path}`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ query, variables }),
        signal: AbortSignal.timeout(timeoutMs),
        cache: 'no-store',
      });
    } catch (error) {
      const timedOut = error instanceof DOMException && error.name === 'TimeoutError';
      throw new TwentyError(op, 0, timedOut ? 'TIMEOUT' : 'NETWORK');
    }

    const body = (await response.json().catch(() => null)) as {
      data?: T;
      errors?: { extensions?: { code?: unknown } }[];
    } | null;

    if (!response.ok) throw new TwentyError(op, response.status, `HTTP_${response.status}`);
    if (!body?.data || body.errors?.length) {
      const code = body?.errors?.[0]?.extensions?.code;
      throw new TwentyError(op, response.status, typeof code === 'string' ? code : 'GRAPHQL_ERROR');
    }
    return body.data;
  }

  const first = <T>(connection: Connection<T>): T | null => connection.edges[0]?.node ?? null;

  return {
    async findSiteByKey(siteKey: string): Promise<Site | null> {
      const data = await request<{ sites: Connection<Site> }>(
        'twenty.findSiteByKey',
        `query FindSiteByKey($siteKey: String!) {
          sites(filter: { siteId: { eq: $siteKey } }, first: 1) { edges { node { id siteId active } } }
        }`,
        { siteKey },
      );
      return first(data.sites);
    },

    async findPersonByEmail(email: string): Promise<Person | null> {
      const data = await request<{ people: Connection<Person> }>(
        'twenty.findPersonByEmail',
        `query FindPersonByEmail($email: String!) {
          people(filter: { emails: { primaryEmail: { eq: $email } } }, first: 1) { edges { node { ${PERSON_FIELDS} } } }
        }`,
        { email },
      );
      return first(data.people);
    },

    async createPerson(input: PersonInput): Promise<{ id: string }> {
      const data = await request<{ createPerson: { id: string } }>(
        'twenty.createPerson',
        `mutation CreatePerson($data: PersonCreateInput!) { createPerson(data: $data) { id } }`,
        { data: input },
      );
      return data.createPerson;
    },

    async updatePerson(id: string, input: PersonInput): Promise<{ id: string }> {
      const data = await request<{ updatePerson: { id: string } }>(
        'twenty.updatePerson',
        `mutation UpdatePerson($id: UUID!, $data: PersonUpdateInput!) { updatePerson(id: $id, data: $data) { id } }`,
        { id, data: input },
      );
      return data.updatePerson;
    },

    async findApplicationBySubmissionKey(submissionKey: string): Promise<ApplicationRef | null> {
      const data = await request<{ applications: Connection<ApplicationRef> }>(
        'twenty.findApplicationBySubmissionKey',
        `query FindApplicationBySubmissionKey($submissionKey: String!) {
          applications(filter: { submissionKey: { eq: $submissionKey } }, first: 1) { edges { node { id personId } } }
        }`,
        { submissionKey },
      );
      return first(data.applications);
    },

    /**
     * Uploads a file for a FILES field (e.g. Application.cvResume): create target -> PUT bytes -> complete.
     * Returns the fileId to store in the field as `[{ fileId, label }]`.
     */
    async uploadFile(input: { filename: string; bytes: Uint8Array; fieldMetadataId: string }): Promise<{ fileId: string }> {
      const { createFileUpload: target } = await request<{
        createFileUpload: { fileId: string; uploadUrl: string; contentType: string };
      }>(
        'twenty.createFileUpload',
        `mutation CreateFileUpload($filename: String!, $size: Float!, $fieldMetadataId: String!) {
          createFileUpload(filename: $filename, size: $size, fileFolder: FilesField, fieldMetadataId: $fieldMetadataId) {
            fileId uploadUrl contentType
          }
        }`,
        { filename: input.filename, size: input.bytes.byteLength, fieldMetadataId: input.fieldMetadataId },
        '/metadata',
      );

      let uploadUrl: URL;
      try {
        uploadUrl = new URL(target.uploadUrl);
      } catch {
        throw new TwentyError('twenty.uploadFile', 0, 'BAD_UPLOAD_URL');
      }
      if (uploadUrl.protocol !== 'https:' || (uploadUrl.origin !== twentyOrigin && !R2_HOST.test(uploadUrl.hostname))) {
        throw new TwentyError('twenty.uploadFile', 0, 'UNEXPECTED_UPLOAD_HOST');
      }

      let put: Response;
      try {
        put = await fetchImpl(uploadUrl, {
          method: 'PUT',
          headers: { 'Content-Type': target.contentType },
          body: input.bytes as BodyInit,
          signal: AbortSignal.timeout(UPLOAD_TIMEOUT_MS),
          cache: 'no-store',
        });
      } catch (error) {
        const timedOut = error instanceof DOMException && error.name === 'TimeoutError';
        throw new TwentyError('twenty.uploadFile', 0, timedOut ? 'TIMEOUT' : 'NETWORK');
      }
      if (!put.ok) throw new TwentyError('twenty.uploadFile', put.status, `HTTP_${put.status}`);

      await request<{ completeFileUpload: { id: string } }>(
        'twenty.completeFileUpload',
        `mutation CompleteFileUpload($fileId: String!) { completeFileUpload(fileId: $fileId) { id } }`,
        { fileId: target.fileId },
        '/metadata',
      );
      return { fileId: target.fileId };
    },

    async createApplication(input: ApplicationInput): Promise<{ id: string }> {
      const data = await request<{ createApplication: { id: string } }>(
        'twenty.createApplication',
        `mutation CreateApplication($data: ApplicationCreateInput!) { createApplication(data: $data) { id } }`,
        { data: input },
      );
      return data.createApplication;
    },
  } as const;
}

export type TwentyClient = ReturnType<typeof createTwentyClient>;
