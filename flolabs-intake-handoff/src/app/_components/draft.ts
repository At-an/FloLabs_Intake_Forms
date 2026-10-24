'use client';

// Unsent answers of a link form, kept in this browser only (approved 2026-10-24): nothing is
// sent to Twenty until the applicant submits. One draft per Application + form; dropped when
// the form version changes, after a successful send, or with "Clear my draft". Storage can be
// unavailable (private mode, blocked site data), so every access is guarded.

const PREFIX = 'flolabs:draft:';

export type Draft<T> = { version: string; savedAt: string; data: T };

export const draftKey = (formType: string, applicationId: string) => `${PREFIX}${formType}:${applicationId}`;

export function loadDraft<T>(key: string, version: string): Draft<T> | null {
  try {
    const raw = window.localStorage.getItem(key);
    if (!raw) return null;
    const draft = JSON.parse(raw) as Partial<Draft<T>>;
    if (draft.version !== version || typeof draft.savedAt !== 'string' || !draft.data || typeof draft.data !== 'object') {
      window.localStorage.removeItem(key);
      return null;
    }
    return draft as Draft<T>;
  } catch {
    return null;
  }
}

export function saveDraft<T>(key: string, version: string, data: T): boolean {
  try {
    window.localStorage.setItem(key, JSON.stringify({ version, savedAt: new Date().toISOString(), data } satisfies Draft<T>));
    return true;
  } catch {
    return false;
  }
}

export function clearDraft(key: string): void {
  try {
    window.localStorage.removeItem(key);
  } catch {
    // Nothing to clear when storage is unavailable.
  }
}
