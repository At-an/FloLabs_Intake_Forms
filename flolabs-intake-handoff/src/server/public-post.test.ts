import { describe, expect, it } from 'vitest';
import { readBodyCapped, readJsonObject } from './public-post';

const streamRequest = (chunks: Uint8Array[], contentType = 'application/json') =>
  new Request('http://localhost/api/x', {
    method: 'POST',
    headers: { 'Content-Type': contentType },
    body: new ReadableStream<Uint8Array>({
      start(controller) {
        for (const chunk of chunks) controller.enqueue(chunk);
        controller.close();
      },
    }),
    duplex: 'half',
  } as RequestInit);

describe('readBodyCapped', () => {
  it('returns the body when it fits', async () => {
    const bytes = await readBodyCapped(streamRequest([new TextEncoder().encode('{"a":1}')]), 100);
    expect(new TextDecoder().decode(bytes)).toBe('{"a":1}');
  });

  it('refuses a body over the limit even without Content-Length', async () => {
    await expect(readBodyCapped(streamRequest([new Uint8Array(60), new Uint8Array(60)]), 100)).rejects.toMatchObject({ code: 'VALIDATION_FAILED' });
  });

  it('refuses early when Content-Length already says too much', async () => {
    const req = new Request('http://localhost/api/x', { method: 'POST', body: 'x'.repeat(200) });
    await expect(readBodyCapped(req, 100)).rejects.toMatchObject({ code: 'VALIDATION_FAILED' });
  });
});

describe('readJsonObject', () => {
  it('parses a small JSON object and rejects an oversized streamed one', async () => {
    await expect(readJsonObject(streamRequest([new TextEncoder().encode('{"ok":true}')]), 100)).resolves.toEqual({ ok: true });
    await expect(readJsonObject(streamRequest([new Uint8Array(150).fill(32)]), 100)).rejects.toMatchObject({ code: 'VALIDATION_FAILED' });
  });
});
