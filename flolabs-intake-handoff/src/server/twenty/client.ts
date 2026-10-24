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
  phones { primaryPhoneNumber primaryPhoneCountryCode primaryPhoneCallingCode }
  location { addressCountry addressState addressCity }
  linkedinLink { primaryLinkUrl primaryLinkLabel }
  education
`;

export function createTwentyClient({ baseUrl, apiKey, fetch: fetchImpl = fetch, timeoutMs = 10_000 }: TwentyClientOptions) {
  const endpoint = `${baseUrl.replace(/\/+$/, '')}/graphql`;

  async function request<T>(op: string, query: string, variables: Record<string, unknown>): Promise<T> {
    let response: Response;
    try {
      response = await fetchImpl(endpoint, {
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
