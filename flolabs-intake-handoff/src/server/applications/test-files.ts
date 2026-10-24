// Test helper: tiny files with real signatures.
export const PDF_BYTES = new TextEncoder().encode(
  '%PDF-1.4\n1 0 obj<</Type/Catalog/Pages 2 0 R>>endobj\n2 0 obj<</Type/Pages/Kids[3 0 R]/Count 1>>endobj\n' +
    '3 0 obj<</Type/Page/Parent 2 0 R/MediaBox[0 0 200 200]>>endobj\ntrailer<</Root 1 0 R>>\n%%EOF\n',
);

// The ZIP structure a .docx starts with; entry names are stored as plain text.
export const DOCX_BYTES = new Uint8Array([
  0x50, 0x4b, 0x03, 0x04,
  ...new TextEncoder().encode('....[Content_Types].xml....word/document.xml....'),
]);

export const ZIP_NOT_DOCX = new Uint8Array([0x50, 0x4b, 0x03, 0x04, ...new TextEncoder().encode('....photos/cat.jpg....')]);

// Windows executable ("MZ" header).
export const EXE_BYTES = new Uint8Array([0x4d, 0x5a, 0x90, 0x00, 0x03, 0x00, 0x00, 0x00]);

export const file = (bytes: Uint8Array, name: string, type = '') => new File([bytes as BlobPart], name, { type });
