// Test helper: in-memory stand-in for the Twenty client that records every call.
import type { Logger } from '../logger';
import { createLogger } from '../logger';
import type { ApplicationInput, Person, PersonInput, Site } from '../twenty/types';
import type { SubmitDeps } from './submit';

export const SITES: Site[] = [
  { id: '00000000-0000-4000-8000-000000000001', siteId: 'flolabs_international', active: true },
  { id: '00000000-0000-4000-8000-000000000002', siteId: 'robocollective', active: true },
  { id: '00000000-0000-4000-8000-000000000003', siteId: 'flomad', active: false },
];

export function fakeTwenty(options: { people?: Person[]; applications?: { id: string; submissionKey: string }[] } = {}) {
  const people = [...(options.people ?? [])];
  const applications = [...(options.applications ?? [])];
  const calls = {
    createPerson: [] as PersonInput[],
    updatePerson: [] as { id: string; input: PersonInput }[],
    createApplication: [] as ApplicationInput[],
  };
  let seq = 100;
  const nextId = () => `00000000-0000-4000-8000-${String(seq++).padStart(12, '0')}`;

  const twenty: SubmitDeps['twenty'] = {
    findSiteByKey: async (key) => SITES.find((s) => s.siteId === key) ?? null,
    findPersonByEmail: async (email) => people.find((p) => p.emails?.primaryEmail === email) ?? null,
    findApplicationBySubmissionKey: async (key) => {
      const found = applications.find((a) => a.submissionKey === key);
      return found ? { id: found.id, personId: null } : null;
    },
    createPerson: async (input) => {
      calls.createPerson.push(input);
      const id = nextId();
      people.push({ id, name: null, emails: null, phones: null, location: null, linkedinLink: null, education: null, ...input });
      return { id };
    },
    updatePerson: async (id, input) => {
      calls.updatePerson.push({ id, input });
      return { id };
    },
    createApplication: async (input) => {
      calls.createApplication.push(input);
      const id = nextId();
      applications.push({ id, submissionKey: input.submissionKey });
      return { id };
    },
  };
  return { twenty, calls, people };
}

export function captureLogger(): { logger: Logger; lines: string[] } {
  const lines: string[] = [];
  return { logger: createLogger((line) => lines.push(line)), lines };
}
