// Test helper: in-memory stand-in for the Twenty client that records every call.
import type { Logger } from '../logger';
import { createLogger } from '../logger';
import type { ApplicationForLink, ApplicationInput, FormSubmissionInput, InquiryInput, Person, PersonInput, ReferenceInput, Site } from '../twenty/types';
import type { TwentyClient } from '../twenty/client';

export const SITES: Site[] = [
  { id: '00000000-0000-4000-8000-000000000001', siteId: 'flolabs_international', active: true },
  { id: '00000000-0000-4000-8000-000000000002', siteId: 'robocollective', active: true },
  { id: '00000000-0000-4000-8000-000000000003', siteId: 'flomad', active: false },
];

export function fakeTwenty(
  options: {
    people?: Person[];
    applications?: ({ id: string; submissionKey: string } & Partial<Pick<ApplicationForLink, 'positionAppliedFor' | 'person'>>)[];
    formSubmissions?: { id: string; applicationId: string; formType: string; submissionKey?: string }[];
  } = {},
) {
  const formSubmissions = [...(options.formSubmissions ?? [])];
  const people = [...(options.people ?? [])];
  const applications = [...(options.applications ?? [])];
  const calls = {
    createPerson: [] as PersonInput[],
    updatePerson: [] as { id: string; input: PersonInput }[],
    createApplication: [] as ApplicationInput[],
    uploadFile: [] as { filename: string; size: number; fieldMetadataId: string }[],
    createInquiry: [] as InquiryInput[],
    createFormSubmission: [] as FormSubmissionInput[],
    createReference: [] as ReferenceInput[],
    order: [] as string[],
  };
  let seq = 100;
  const nextId = () => `00000000-0000-4000-8000-${String(seq++).padStart(12, '0')}`;

  const inquiries: { id: string; submissionKey: string }[] = [];
  const references: (ReferenceInput & { id: string })[] = [];
  // Writable, so a test can replace one operation (e.g. to make it fail).
  const twenty: { -readonly [K in keyof TwentyClient]: TwentyClient[K] } = {
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
    findApplicationForLink: async (id) => {
      const found = applications.find((a) => a.id === id);
      return found ? { id: found.id, positionAppliedFor: found.positionAppliedFor ?? [], person: found.person ?? null } : null;
    },
    findFormSubmissionFor: async (applicationId, formType) => {
      const found = formSubmissions.find((s) => s.applicationId === applicationId && s.formType === formType);
      return found ? { id: found.id } : null;
    },
    findFormSubmissionBySubmissionKey: async (key) => {
      const found = formSubmissions.find((s) => s.submissionKey === key);
      return found ? { id: found.id, applicationId: found.applicationId, formType: found.formType } : null;
    },
    createFormSubmission: async (input) => {
      calls.createFormSubmission.push(input);
      calls.order.push('createFormSubmission');
      const id = nextId();
      formSubmissions.push({ id, applicationId: input.applicationId, formType: input.formType, submissionKey: input.submissionKey });
      return { id };
    },
    findReferenceFor: async (applicationId, email) => {
      const found = references.find((r) => r.applicationId === applicationId && r.email.primaryEmail === email);
      return found ? { id: found.id } : null;
    },
    createReference: async (input) => {
      calls.createReference.push(input);
      calls.order.push('createReference');
      const id = nextId();
      references.push({ ...input, id });
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
  return { twenty, calls, people, formSubmissions, references };
}

export function captureLogger(): { logger: Logger; lines: string[] } {
  const lines: string[] = [];
  return { logger: createLogger((line) => lines.push(line)), lines };
}
