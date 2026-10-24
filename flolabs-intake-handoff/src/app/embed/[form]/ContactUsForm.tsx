'use client';

import { useId, useMemo, useState, type FormEvent } from 'react';
import { TURNSTILE_ACTIONS } from '@/shared/config/application';
import { CONTACT_US_FORM } from '@/shared/config/embed-forms';
import { contactUsSchema } from '@/shared/forms/embed-forms';
import { fieldErrors } from '@/shared/forms/field-errors';
import { ErrorText, Field, newSubmissionKey } from '../../_components/form-ui';
import styles from '../../_components/form.module.css';
import { Turnstile } from '../../_components/Turnstile';

const FIELDS = ['firstName', 'lastName', 'email', 'subject', 'message', 'turnstile'] as const;
type Key = (typeof FIELDS)[number];
type Values = Record<Exclude<Key, 'turnstile'>, string>;

const { limits } = CONTACT_US_FORM;
const GENERIC_ERROR = 'Something went wrong. Please try again later.';
const TURNSTILE_MESSAGE = 'Please complete the security check.';

export function ContactUsForm({ siteKey, turnstileSiteKey }: { siteKey?: string; turnstileSiteKey: string }) {
  const idPrefix = useId();
  const id = (key: string) => `${idPrefix}-${key}`;
  const [values, setValues] = useState<Values>({ firstName: '', lastName: '', email: '', subject: '', message: '' });
  const [touched, setTouched] = useState<ReadonlySet<string>>(new Set());
  const [submitted, setSubmitted] = useState(false);
  const [serverErrors, setServerErrors] = useState<Partial<Record<string, string>>>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [status, setStatus] = useState<'idle' | 'sending' | 'done'>('idle');
  const [submissionKey] = useState(newSubmissionKey);
  const [turnstileToken, setTurnstileToken] = useState<string | null>(null);
  const [turnstileReset, setTurnstileReset] = useState(0);

  const errors = useMemo((): Partial<Record<string, string>> => {
    const result = contactUsSchema.safeParse({ ...values, submissionKey });
    return {
      ...(result.success ? {} : fieldErrors(result.error)),
      ...(!turnstileToken && { turnstile: TURNSTILE_MESSAGE }),
      ...serverErrors,
    };
  }, [values, submissionKey, turnstileToken, serverErrors]);

  const errorFor = (key: Key) => ((submitted || touched.has(key)) && errors[key]) || undefined;
  const isOk = (key: Key) => touched.has(key) && !errors[key];
  const touch = (key: string) => setTouched((current) => (current.has(key) ? current : new Set(current).add(key)));
  const set = (key: keyof Values, value: string) => {
    setValues((current) => ({ ...current, [key]: value }));
    if (serverErrors[key]) setServerErrors((current) => Object.fromEntries(Object.entries(current).filter(([k]) => k !== key)));
  };

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (status === 'sending') return;
    setSubmitted(true);
    setFormError(null);
    const firstError = FIELDS.find((key) => errors[key]);
    if (firstError) {
      document.getElementById(id(firstError))?.focus();
      return;
    }

    setStatus('sending');
    try {
      const response = await fetch('/api/inquiries', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...values, submissionKey, site: siteKey, turnstileToken }),
      });
      const result = await response.json().catch(() => null);
      setTurnstileReset((n) => n + 1); // tokens are single use
      if (response.ok) return setStatus('done');
      setStatus('idle');
      if (response.status === 400 && result?.error?.fields) setServerErrors(result.error.fields);
      setFormError(typeof result?.error?.message === 'string' ? result.error.message : GENERIC_ERROR);
    } catch {
      setStatus('idle');
      setTurnstileReset((n) => n + 1);
      setFormError('We could not reach the server. Check your connection and try again.');
    }
  }

  if (status === 'done') {
    return (
      <section className={styles.card} aria-live="polite">
        <h2 className={styles.doneTitle}>Thank you, {values.firstName.trim()}! Your message was sent.</h2>
        <p>
          We will reply to <strong>{values.email.trim().toLowerCase()}</strong> as soon as we can.
        </p>
      </section>
    );
  }

  const input = (key: Exclude<keyof Values, 'message'>, label: string, type: 'text' | 'email', autoComplete: string, maxLength: number) => (
    <Field id={id(key)} label={label} required error={errorFor(key)} ok={isOk(key)}>
      <input
        id={id(key)}
        name={key}
        type={type}
        autoComplete={autoComplete}
        maxLength={maxLength}
        required
        value={values[key]}
        aria-invalid={Boolean(errorFor(key))}
        aria-describedby={errorFor(key) ? `${id(key)}-error` : undefined}
        onChange={(e) => set(key, e.target.value)}
        onBlur={() => touch(key)}
        className={styles.input}
      />
    </Field>
  );

  return (
    <form className={styles.card} onSubmit={onSubmit} noValidate aria-busy={status === 'sending'}>
      <h1 className={styles.embedTitle}>Contact us</h1>
      <div className={styles.row}>
        {input('firstName', 'First name', 'text', 'given-name', limits.name)}
        {input('lastName', 'Last name', 'text', 'family-name', limits.name)}
      </div>
      {input('email', 'Email', 'email', 'email', limits.email)}
      {input('subject', 'Subject', 'text', 'off', limits.subject)}
      <Field
        id={id('message')}
        label="How can we help?"
        required
        hint={`${values.message.length} / ${limits.message} characters`}
        error={errorFor('message')}
        ok={isOk('message')}
      >
        <textarea
          id={id('message')}
          name="message"
          rows={6}
          maxLength={limits.message}
          required
          value={values.message}
          aria-invalid={Boolean(errorFor('message'))}
          aria-describedby={[`${id('message')}-hint`, errorFor('message') && `${id('message')}-error`].filter(Boolean).join(' ')}
          onChange={(e) => set('message', e.target.value)}
          onBlur={() => touch('message')}
          className={`${styles.input} ${styles.textarea}`}
        />
      </Field>

      <div className={styles.field} id={id('turnstile')} tabIndex={-1}>
        <Turnstile siteKey={turnstileSiteKey} action={TURNSTILE_ACTIONS.contactUs} resetKey={turnstileReset} onToken={setTurnstileToken} />
        {errorFor('turnstile') && <ErrorText id={`${id('turnstile')}-error`}>{errorFor('turnstile')}</ErrorText>}
      </div>

      {formError && (
        <p className={styles.formError} role="alert">
          {formError}
        </p>
      )}
      <button type="submit" className={styles.submit} disabled={status === 'sending'}>
        {status === 'sending' ? 'Sending…' : 'Send message'}
      </button>
    </form>
  );
}
