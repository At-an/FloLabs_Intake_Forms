'use client';

import { useId, useState, type FormEvent } from 'react';
import { TURNSTILE_ACTIONS } from '@/shared/config/application';
import { NEWSLETTER_TEXT } from '@/shared/config/embed-forms';
import { newsletterSchema } from '@/shared/forms/embed-forms';
import { fieldErrors } from '@/shared/forms/field-errors';
import { ErrorText, newSubmissionKey } from '../../_components/form-ui';
import styles from '../../_components/form.module.css';
import { Turnstile } from '../../_components/Turnstile';

const GENERIC_ERROR = 'Something went wrong. Please try again later.';

export function NewsletterForm({ siteKey, turnstileSiteKey }: { siteKey: string; turnstileSiteKey: string }) {
  const idPrefix = useId();
  const emailId = `${idPrefix}-email`;
  const [email, setEmail] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [status, setStatus] = useState<'idle' | 'sending' | 'done'>('idle');
  const [submissionKey] = useState(newSubmissionKey);
  const [turnstileToken, setTurnstileToken] = useState<string | null>(null);
  const [turnstileReset, setTurnstileReset] = useState(0);

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (status === 'sending') return;
    const check = newsletterSchema.safeParse({ email, submissionKey });
    if (!check.success) {
      setError(fieldErrors(check.error).email ?? GENERIC_ERROR);
      document.getElementById(emailId)?.focus();
      return;
    }
    if (!turnstileToken) return setError('Please complete the security check.');

    setStatus('sending');
    setError(null);
    try {
      const response = await fetch('/api/newsletter', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, submissionKey, site: siteKey, turnstileToken }),
      });
      const result = await response.json().catch(() => null);
      setTurnstileReset((n) => n + 1); // tokens are single use
      if (response.ok) return setStatus('done');
      setStatus('idle');
      setError(result?.error?.fields?.email ?? (typeof result?.error?.message === 'string' ? result.error.message : GENERIC_ERROR));
    } catch {
      setStatus('idle');
      setTurnstileReset((n) => n + 1);
      setError('We could not reach the server. Check your connection and try again.');
    }
  }

  if (status === 'done') {
    return (
      <p className={styles.doneTitle} aria-live="polite">
        {NEWSLETTER_TEXT.done}
      </p>
    );
  }

  return (
    <form onSubmit={onSubmit} noValidate aria-busy={status === 'sending'} className={styles.newsletter}>
      <label htmlFor={emailId} className={styles.embedTitle}>
        {NEWSLETTER_TEXT.title}
      </label>
      <div className={styles.inline}>
        <input
          id={emailId}
          name="email"
          type="email"
          autoComplete="email"
          placeholder="name@example.com"
          maxLength={254}
          required
          value={email}
          aria-invalid={Boolean(error)}
          aria-describedby={[`${emailId}-consent`, error && `${emailId}-error`].filter(Boolean).join(' ')}
          onChange={(e) => {
            setEmail(e.target.value);
            setError(null);
          }}
          className={styles.input}
        />
        <button type="submit" className={styles.submit} disabled={status === 'sending'}>
          {status === 'sending' ? 'Sending…' : 'Subscribe'}
        </button>
      </div>
      {error && <ErrorText id={`${emailId}-error`}>{error}</ErrorText>}
      <p id={`${emailId}-consent`} className={styles.hint}>
        {NEWSLETTER_TEXT.consent}
      </p>
      <Turnstile siteKey={turnstileSiteKey} action={TURNSTILE_ACTIONS.newsletter} resetKey={turnstileReset} onToken={setTurnstileToken} size="flexible" />
    </form>
  );
}
