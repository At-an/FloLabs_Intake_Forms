import { afterEach, describe, expect, it, vi } from 'vitest';
import { clearDraft, draftKey, loadDraft, saveDraft } from './draft';

function stubStorage(blocked = false) {
  const store = new Map<string, string>();
  const fail = () => {
    throw new DOMException('blocked', 'SecurityError');
  };
  vi.stubGlobal('window', {
    localStorage: {
      getItem: (k: string) => (blocked ? fail() : (store.get(k) ?? null)),
      setItem: (k: string, v: string) => (blocked ? fail() : void store.set(k, v)),
      removeItem: (k: string) => (blocked ? fail() : void store.delete(k)),
    },
  });
  return store;
}

const KEY = draftKey('CONTACTED', '00000000-0000-4000-8000-0000000000a1');

describe('link form drafts (browser storage)', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('saves and restores a draft for the same form version', () => {
    stubStorage();
    expect(saveDraft(KEY, 'contacted-v1', { answers: { G4: 'Hi' } })).toBe(true);
    expect(loadDraft(KEY, 'contacted-v1')).toMatchObject({ version: 'contacted-v1', data: { answers: { G4: 'Hi' } } });
  });

  it('drops a draft made for another form version', () => {
    const store = stubStorage();
    saveDraft(KEY, 'contacted-v1', { answers: {} });
    expect(loadDraft(KEY, 'contacted-v2')).toBeNull();
    expect(store.size).toBe(0);
  });

  it('keeps one draft per form and Application, and clears it', () => {
    const store = stubStorage();
    saveDraft(KEY, 'v', { a: 1 });
    saveDraft(draftKey('BEFORE_MEETING', '00000000-0000-4000-8000-0000000000a1'), 'v', { a: 2 });
    clearDraft(KEY);
    expect([...store.keys()]).toEqual(['flolabs:draft:BEFORE_MEETING:00000000-0000-4000-8000-0000000000a1']);
  });

  it('ignores broken data and works without storage', () => {
    const store = stubStorage();
    store.set(KEY, '{not json');
    expect(loadDraft(KEY, 'v')).toBeNull();
    stubStorage(true);
    expect(saveDraft(KEY, 'v', {})).toBe(false);
    expect(loadDraft(KEY, 'v')).toBeNull();
    expect(() => clearDraft(KEY)).not.toThrow();
  });
});
