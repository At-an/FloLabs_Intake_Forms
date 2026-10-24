import { describe, expect, it } from 'vitest';
import { CV_MESSAGES, cvProblem, MAX_CV_BYTES } from '@/shared/forms/cv';
import { checkCv, cvLabel, detectCvKind } from './cv';
import { DOCX_BYTES, EXE_BYTES, file, PDF_BYTES, ZIP_NOT_DOCX } from './test-files';

describe('checkCv (server, by file signature)', () => {
  it('accepts a PDF and a DOCX', async () => {
    expect(await checkCv(file(PDF_BYTES, 'Jane Doe CV.pdf'))).toMatchObject({ ok: true, cv: { kind: 'pdf', label: 'Jane Doe CV.pdf' } });
    expect(await checkCv(file(DOCX_BYTES, 'cv.docx'))).toMatchObject({ ok: true, cv: { kind: 'docx', label: 'cv.docx' } });
  });

  it('rejects a renamed .exe, even with a PDF name and MIME type', async () => {
    expect(await checkCv(file(EXE_BYTES, 'cv.pdf', 'application/pdf'))).toEqual({ ok: false, message: CV_MESSAGES.type });
  });

  it('rejects a ZIP that is not a Word document', async () => {
    expect(await checkCv(file(ZIP_NOT_DOCX, 'cv.docx'))).toEqual({ ok: false, message: CV_MESSAGES.type });
  });

  it('rejects missing, empty and oversized files', async () => {
    expect(await checkCv(null)).toEqual({ ok: false, message: CV_MESSAGES.missing });
    expect(await checkCv(file(new Uint8Array(), 'cv.pdf'))).toEqual({ ok: false, message: CV_MESSAGES.empty });
    const big = new Uint8Array(MAX_CV_BYTES + 1);
    big.set(PDF_BYTES);
    expect(await checkCv(file(big, 'cv.pdf'))).toEqual({ ok: false, message: CV_MESSAGES.tooLarge });
  });

  it('accepts exactly 5 MB', async () => {
    const max = new Uint8Array(MAX_CV_BYTES);
    max.set(PDF_BYTES);
    expect((await checkCv(file(max, 'cv.pdf'))).ok).toBe(true);
  });

  it('trusts the content over the name: a PDF named .docx is stored as .pdf', async () => {
    expect(await checkCv(file(PDF_BYTES, 'resume.docx'))).toMatchObject({ ok: true, cv: { kind: 'pdf', label: 'resume.pdf' } });
  });
});

describe('cvLabel', () => {
  it('drops folders and unsafe characters and keeps the real extension', () => {
    expect(cvLabel('C:\\Users\\jane\\My <CV>?.PDF', 'pdf')).toBe('My CV.pdf');
    expect(cvLabel('../../etc/passwd', 'pdf')).toBe('passwd.pdf');
    expect(cvLabel('.pdf', 'pdf')).toBe('CV.pdf');
    expect(cvLabel(`${'a'.repeat(200)}.docx`, 'docx')).toHaveLength(95);
  });
});

describe('detectCvKind', () => {
  it('only recognises the PDF and DOCX signatures', () => {
    expect(detectCvKind(PDF_BYTES)).toBe('pdf');
    expect(detectCvKind(DOCX_BYTES)).toBe('docx');
    expect(detectCvKind(EXE_BYTES)).toBeNull();
    expect(detectCvKind(new TextEncoder().encode('just text'))).toBeNull();
  });
});

describe('cvProblem (browser, instant feedback)', () => {
  it('checks presence, extension and size', () => {
    expect(cvProblem(null)).toBe(CV_MESSAGES.missing);
    expect(cvProblem({ name: 'cv.png', size: 10 })).toBe(CV_MESSAGES.type);
    expect(cvProblem({ name: 'CV.PDF', size: 0 })).toBe(CV_MESSAGES.empty);
    expect(cvProblem({ name: 'cv.docx', size: MAX_CV_BYTES + 1 })).toBe(CV_MESSAGES.tooLarge);
    expect(cvProblem({ name: 'cv.docx', size: 1000 })).toBeNull();
  });
});
