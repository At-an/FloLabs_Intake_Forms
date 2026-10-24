'use client';

import type { ReactNode } from 'react';
import styles from './form.module.css';

// Building blocks shared by every form (Application, Contact Us, Newsletter).

/** UUID v4 that also works on plain-http test addresses, where crypto.randomUUID is unavailable. */
export function newSubmissionKey(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(16));
  bytes[6] = (bytes[6]! & 0x0f) | 0x40;
  bytes[8] = (bytes[8]! & 0x3f) | 0x80;
  const hex = Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

export function Required() {
  return (
    <span className={styles.required} aria-hidden="true">
      *
    </span>
  );
}

export function ErrorText({ id, children }: { id: string; children: ReactNode }) {
  return (
    <p id={id} className={styles.error}>
      {children}
    </p>
  );
}

export function Field({
  id,
  label,
  required,
  hint,
  error,
  ok,
  children,
}: {
  id: string;
  label: string;
  required?: boolean;
  hint?: string;
  error?: string;
  ok?: boolean;
  children: ReactNode;
}) {
  return (
    <div className={styles.field}>
      <label htmlFor={id} className={styles.label}>
        {label} {required && <Required />}
      </label>
      {hint && (
        <p id={`${id}-hint`} className={styles.hint}>
          {hint}
        </p>
      )}
      {children}
      {error ? (
        <ErrorText id={`${id}-error`}>{error}</ErrorText>
      ) : (
        ok && (
          <p className={styles.ok} aria-hidden="true">
            Looks good
          </p>
        )
      )}
    </div>
  );
}
