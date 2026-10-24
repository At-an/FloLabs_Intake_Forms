// Test helper: in-memory stand-in for the Twenty client that records every call.
import type { Logger } from '../logger';
import { createLogger } from '../logger';
import type { ApplicationInput, InquiryInput, Person, PersonInput, Site } from '../twenty/types';
import type { TwentyClient } from '../twenty/client';

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
    uploadFile: [] as { filename: string; size: number; fieldMetadataId: string }[],
    createInquiry: [] as InquiryInput[],
    order: [] as string[],
  };
  let seq = 100;
  const nextId = () => `00000000-0000-4000-8000-${String(seq++).padStart(12, '0')}`;

  const inquiries: { id: string; submissionKey: string }[] = [];
  const twenty: Omit<TwentyClient, never> = {
    findSiteByKey: async (key) => SITES.find((s) => s.siteId === key) ?? null,
    findPersonByEmail: async (email) => people.find((p) => p.emails?.primaryEmail === email) ?? null,
    findApplicationBySubmissionKey: async (key) => {
      const found = applications.find((a) => a.submissionKey === key);
      return found ? { id: found.id, personId: null } : null;
    },
    uploadFile: async ({ filename, bytes, fieldMetadataId }) => {
      calls.uploadFile.push({ filename, size: bytes.byteLength, fieldMetadataId });
      calls.order.push('uploadFile');
      return { fileId: nextId() };
    },
    createPerson: async (input) => {
      calls.createPerson.push(input);
      calls.order.push('createPerson');
      const id = nextId();
      people.push({ id, name: null, emails: null, phones: null, location: null, linkedinLink: null, education: null, ...input });
      return { id };
    },
    updatePerson: async (id, input) => {
      calls.updatePerson.push({ id, input });
      const index = people.findIndex((p) => p.id === id);
      if (index >= 0) people[index] = { ...people[index]!, ...input };
      return { id };
    },
    findInquiryBySubmissionKey: async (key) => {
      const found = inquiries.find((i) => i.submissionKey === key);
      return found ? { id: found.id } : null;
    },
    createInquiry: async (input) => {
      calls.createInquiry.push(input);
      const id = nextId();
      inquiries.push({ id, submissionKey: input.submissionKey });
      return { id };
    },
    createApplication: async (input) => {
      calls.createApplication.push(input);
      calls.order.push('createApplication');
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
