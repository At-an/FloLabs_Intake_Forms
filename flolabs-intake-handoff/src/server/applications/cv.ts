import 'server-only';
import { CV_MESSAGES, CV_TYPES, MAX_CV_BYTES, type CvKind } from '@/shared/forms/cv';

// Server-side CV check (CLAUDE.md section 6): PDF or DOCX by file signature, not by the
// name or the browser's MIME type, max 5 MB. A renamed .exe or any other file is rejected.

export type CheckedCv = { kind: CvKind; bytes: Uint8Array; label: string };
export type CvCheck = { ok: true; cv: CheckedCv } | { ok: false; message: string };

const PDF_MAGIC = [0x25, 0x50, 0x44, 0x46, 0x2d]; // %PDF-
const ZIP_MAGIC = [0x50, 0x4b, 0x03, 0x04]; // PK\x03\x04

const startsWith = (bytes: Uint8Array, magic: number[]) => magic.every((b, i) => bytes[i] === b);

/** True if the ZIP contains an entry whose name starts with `prefix` (names are stored as plain text). */
function zipHasEntry(bytes: Uint8Array, prefix: string): boolean {
  const needle = new TextEncoder().encode(prefix);
  outer: for (let i = 0; i <= bytes.length - needle.length; i++) {
    for (let j = 0; j < needle.length; j++) if (bytes[i + j] !== needle[j]) continue outer;
    return true;
  }
  return false;
}

export function detectCvKind(bytes: Uint8Array): CvKind | null {
  if (startsWith(bytes, PDF_MAGIC)) return 'pdf';
  // A .docx is a ZIP package with a Word document part and a content-types part.
  if (startsWith(bytes, ZIP_MAGIC) && zipHasEntry(bytes, 'word/document.xml') && zipHasEntry(bytes, '[Content_Types].xml')) {
    return 'docx';
  }
  return null;
}

/** File name shown in Twenty: no path, no control characters, max 100 chars, extension of the real type. */
export function cvLabel(originalName: string, kind: CvKind): string {
  const base = originalName.split(/[\\/]/).pop() ?? '';
  const stem = base
    .replace(/\.[^.]*$/, '')
    .replace(/[\u0000-\u001f\u007f<>:"|?*]/g, '')
    .trim()
    .slice(0, 90);
  return `${stem || 'CV'}${CV_TYPES[kind].extension}`;
}

export async function checkCv(file: File | null): Promise<CvCheck> {
  if (!file || typeof file === 'string') return { ok: false, message: CV_MESSAGES.missing };
  if (file.size === 0) return { ok: false, message: CV_MESSAGES.empty };
  if (file.size > MAX_CV_BYTES) return { ok: false, message: CV_MESSAGES.tooLarge };
  const bytes = new Uint8Array(await file.arrayBuffer());
  const kind = detectCvKind(bytes);
  if (!kind) return { ok: false, message: CV_MESSAGES.type };
  return { ok: true, cv: { kind, bytes, label: cvLabel(file.name, kind) } };
}
