'use client';

import { useId, useMemo, useRef, useState, type FormEvent } from 'react';
import { CONSENT_TEXT, HR_EMAIL, LIMITS, TURNSTILE_ACTIONS } from '@/shared/config/application';
import { PROGRAMS_BY_TRACK } from '@/shared/config/programs';
import { SOURCES } from '@/shared/config/sources';
import { applicationSchema, fieldErrors } from '@/shared/forms/application';
import { CV_ACCEPT, cvProblem } from '@/shared/forms/cv';
import { ErrorText, Field, newSubmissionKey, Required } from '../_components/form-ui';
import styles from '../_components/form.module.css';
import { Turnstile } from '../_components/Turnstile';

type Country = { value: string; label: string; callingCode: string };

type Values = {
  firstName: string;
  lastName: string;
  email: string;
  phoneCountry: string;
  phoneNumber: string;
  country: string;
  state: string;
  city: string;
  linkedinUrl: string;
  education: string;
  programs: string[];
  source: string;
  sourceDetail: string;
  referralName: string;
  safeSenderConfirmed: boolean;
  marketingOptIn: boolean;
  smsOptIn: boolean;
};

const EMPTY: Values = {
  firstName: '',
  lastName: '',
  email: '',
  phoneCountry: '',
  phoneNumber: '',
  country: '',
  state: '',
  city: '',
  linkedinUrl: '',
  education: '',
  programs: [],
  source: '',
  sourceDetail: '',
  referralName: '',
  safeSenderConfirmed: false,
  marketingOptIn: false,
  smsOptIn: false,
};

// Error keys (from fieldErrors) in the order the fields appear, with the element to focus.
const FIELD_ORDER = [
  'firstName',
  'lastName',
  'email',
  'phone.country',
  'phone.number',
  'country',
  'state',
  'city',
  'linkedinUrl',
  'education',
  'programs',
  'cv',
  'source',
  'sourceDetail',
  'referralName',
  'safeSenderConfirmed',
  'turnstile',
] as const;
type FieldKey = (typeof FIELD_ORDER)[number];

const GENERIC_ERROR = 'Something went wrong. Please try again later.';
const TURNSTILE_MESSAGE = 'Please complete the security check below.';

function toRequest(values: Values, submissionKey: string) {
  const { phoneCountry, phoneNumber, source, ...rest } = values;
  return {
    ...rest,
    submissionKey,
    phone: { country: phoneCountry, number: phoneNumber },
    source: source || undefined,
  };
}

export function ApplicationForm({
  siteKey,
  countries,
  turnstileSiteKey,
}: {
  siteKey?: string;
  countries: Country[];
  turnstileSiteKey: string;
}) {
  const idPrefix = useId();
  const id = (key: string) => `${idPrefix}-${key.replace('.', '-')}`;

  const [values, setValues] = useState<Values>(EMPTY);
  const [cvFile, setCvFile] = useState<File | null>(null);
  const [turnstileToken, setTurnstileToken] = useState<string | null>(null);
  const [turnstileReset, setTurnstileReset] = useState(0);
  const [touched, setTouched] = useState<ReadonlySet<string>>(new Set());
  const [submitted, setSubmitted] = useState(false);
  const [serverErrors, setServerErrors] = useState<Partial<Record<string, string>>>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [status, setStatus] = useState<'idle' | 'sending' | 'done'>('idle');
  // One key per form: retries and double clicks reuse it, so the server never creates two Applications.
  const [submissionKey] = useState(newSubmissionKey);
  const summaryRef = useRef<HTMLDivElement>(null);
  const doneRef = useRef<HTMLHeadingElement>(null);

  const errors = useMemo((): Partial<Record<string, string>> => {
    const result = applicationSchema.safeParse(toRequest(values, submissionKey));
    const cv = cvProblem(cvFile);
    return {
      ...(result.success ? {} : fieldErrors(result.error)),
      ...(cv && { cv }),
      ...(!turnstileToken && { turnstile: TURNSTILE_MESSAGE }),
      ...serverErrors,
    };
  }, [values, cvFile, turnstileToken, submissionKey, serverErrors]);

  const visibleErrors = FIELD_ORDER.filter((key) => errors[key] && (submitted || touched.has(key)));
  const errorFor = (key: FieldKey) => (visibleErrors.includes(key) ? errors[key] : undefined);
  const isOk = (key: FieldKey, filled: boolean) => filled && touched.has(key) && !errors[key];

  function set<K extends keyof Values>(key: K, value: Values[K], errorKey: string = key) {
    setValues((current) => {
      const next = { ...current, [key]: value };
      // Default the phone country to the chosen country until the applicant picks one.
      if (key === 'country' && !current.phoneCountry) next.phoneCountry = value as string;
      return next;
    });
    if (serverErrors[errorKey]) {
      setServerErrors((current) => Object.fromEntries(Object.entries(current).filter(([k]) => k !== errorKey)));
    }
  }
  const touch = (key: string) => setTouched((current) => (current.has(key) ? current : new Set(current).add(key)));

  function focusFirstError(found: Partial<Record<string, string>>) {
    const first = FIELD_ORDER.find((key) => found[key]);
    summaryRef.current?.focus();
    if (first) document.getElementById(id(first))?.scrollIntoView({ block: 'center' });
  }

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (status === 'sending') return;
    setSubmitted(true);
    setFormError(null);

    const request = toRequest(values, submissionKey);
    const check = applicationSchema.safeParse(request);
    const cvError = cvProblem(cvFile);
    if (!check.success || cvError || !cvFile || !turnstileToken) {
      const found = {
        ...(check.success ? {} : fieldErrors(check.error)),
        ...(cvError && { cv: cvError }),
        ...(!turnstileToken && { turnstile: TURNSTILE_MESSAGE }),
      };
      requestAnimationFrame(() => focusFirstError(found));
      return;
    }

    setStatus('sending');
    try {
      // Multipart: the browser sets the Content-Type boundary itself.
      const body = new FormData();
      body.set('data', JSON.stringify({ ...request, site: siteKey, turnstileToken }));
      body.set('cv', cvFile);
      const response = await fetch('/api/applications', { method: 'POST', body });
      const result = await response.json().catch(() => null);
      // The token was spent on this attempt; get a fresh one for any retry.
      setTurnstileReset((n) => n + 1);
      if (response.ok) {
        setStatus('done');
        requestAnimationFrame(() => doneRef.current?.focus());
        return;
      }
      setStatus('idle');
      if (response.status === 400 && result?.error?.fields) {
        setServerErrors(result.error.fields);
        requestAnimationFrame(() => focusFirstError(result.error.fields));
      }
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
        <h2 ref={doneRef} tabIndex={-1} className={styles.doneTitle}>
          Thank you, {values.firstName.trim()}! Your application was received.
        </h2>
        <p>
          We will contact you at <strong>{values.email.trim().toLowerCase()}</strong> from <strong>{HR_EMAIL}</strong>.
          Please keep an eye on your inbox.
        </p>
      </section>
    );
  }

  const describedBy = (key: FieldKey, hint?: boolean) =>
    [hint && `${id(key)}-hint`, errorFor(key) && `${id(key)}-error`].filter(Boolean).join(' ') || undefined;

  const text = (key: FieldKey & keyof Values, label: string, props: TextProps = {}) => {
    const value = values[key] as string;
    return (
      <Field
        id={id(key)}
        label={label}
        required={props.required}
        hint={props.hint}
        error={errorFor(key)}
        ok={isOk(key, value.trim() !== '')}
      >
        <input
          id={id(key)}
          name={key}
          type={props.type ?? 'text'}
          autoComplete={props.autoComplete}
          inputMode={props.inputMode}
          maxLength={props.maxLength}
          required={props.required}
          value={value}
          aria-invalid={Boolean(errorFor(key))}
          aria-describedby={describedBy(key, Boolean(props.hint))}
          onChange={(e) => set(key, e.target.value)}
          onBlur={() => touch(key)}
          className={styles.input}
        />
      </Field>
    );
  };

  return (
    <form className={styles.card} onSubmit={onSubmit} noValidate aria-busy={status === 'sending'}>
      <div ref={summaryRef} tabIndex={-1} className={styles.summaryAnchor}>
        {submitted && visibleErrors.length > 0 && (
          <div className={styles.summary} role="alert">
            <h2 className={styles.summaryTitle}>
              Please fix {visibleErrors.length === 1 ? 'this field' : `these ${visibleErrors.length} fields`}:
            </h2>
            <ul>
              {visibleErrors.map((key) => (
                <li key={key}>
                  <a href={`#${id(key)}`}>{errors[key]}</a>
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>

      <fieldset className={styles.section}>
        <legend className={styles.sectionTitle}>About you</legend>
        <div className={styles.row}>
          {text('firstName', 'First name', { required: true, autoComplete: 'given-name', maxLength: LIMITS.name })}
          {text('lastName', 'Last name', { required: true, autoComplete: 'family-name', maxLength: LIMITS.name })}
        </div>
        {text('email', 'Email', { required: true, type: 'email', autoComplete: 'email', maxLength: LIMITS.email })}

        <div className={styles.row}>
          <Field id={id('phone.country')} label="Phone country code" required error={errorFor('phone.country')}>
            <select
              id={id('phone.country')}
              name="phoneCountry"
              required
              value={values.phoneCountry}
              aria-invalid={Boolean(errorFor('phone.country'))}
              aria-describedby={describedBy('phone.country')}
              onChange={(e) => set('phoneCountry', e.target.value, 'phone.country')}
              onBlur={() => touch('phone.country')}
              className={styles.input}
            >
              <option value="">Choose…</option>
              {countries.map((c) => (
                <option key={c.value} value={c.value}>
                  {c.label} ({c.callingCode})
                </option>
              ))}
            </select>
          </Field>
          <Field
            id={id('phone.number')}
            label="Phone number"
            required
            error={errorFor('phone.number')}
            ok={isOk('phone.number', values.phoneNumber.trim() !== '')}
          >
            <input
              id={id('phone.number')}
              name="phoneNumber"
              type="tel"
              autoComplete="tel-national"
              inputMode="tel"
              maxLength={30}
              required
              value={values.phoneNumber}
              aria-invalid={Boolean(errorFor('phone.number'))}
              aria-describedby={describedBy('phone.number')}
              onChange={(e) => set('phoneNumber', e.target.value, 'phone.number')}
              onBlur={() => touch('phone.number')}
              className={styles.input}
            />
          </Field>
        </div>

        <Field id={id('country')} label="Country/Region" required error={errorFor('country')}>
          <select
            id={id('country')}
            name="country"
            autoComplete="country"
            required
            value={values.country}
            aria-invalid={Boolean(errorFor('country'))}
            aria-describedby={describedBy('country')}
            onChange={(e) => set('country', e.target.value)}
            onBlur={() => touch('country')}
            className={styles.input}
          >
            <option value="">Choose…</option>
            {countries.map((c) => (
              <option key={c.value} value={c.value}>
                {c.label}
              </option>
            ))}
          </select>
        </Field>
        <div className={styles.row}>
          {text('state', 'State/Region', { autoComplete: 'address-level1', maxLength: LIMITS.state })}
          {text('city', 'City/Town', { required: true, autoComplete: 'address-level2', maxLength: LIMITS.city })}
        </div>
        {text('linkedinUrl', 'LinkedIn profile', {
          type: 'url',
          inputMode: 'url',
          autoComplete: 'url',
          maxLength: LIMITS.linkedinUrl,
          hint: 'For example linkedin.com/in/your-name',
        })}
        {text('education', 'Education/Major', { required: true, maxLength: LIMITS.education })}
      </fieldset>

      <fieldset
        className={styles.section}
        id={id('programs')}
        tabIndex={-1}
        aria-describedby={describedBy('programs', true)}
        aria-invalid={Boolean(errorFor('programs'))}
      >
        <legend className={styles.sectionTitle}>
          Programs you are applying for <Required />
        </legend>
        <p id={`${id('programs')}-hint`} className={styles.hint}>
          Choose one or more. {values.programs.length > 0 && <strong>{values.programs.length} selected.</strong>}
        </p>
        {errorFor('programs') && <ErrorText id={`${id('programs')}-error`}>{errorFor('programs')}</ErrorText>}
        <div className={styles.tracks}>
          {PROGRAMS_BY_TRACK.map((track) => (
            <fieldset key={track.value} className={styles.track}>
              <legend className={styles.trackTitle}>{track.label}</legend>
              {track.programs.map((program) => {
                const checked = values.programs.includes(program.value);
                return (
                  <label key={program.value} className={styles.check}>
                    <input
                      type="checkbox"
                      name="programs"
                      value={program.value}
                      checked={checked}
                      onChange={() => {
                        set(
                          'programs',
                          checked ? values.programs.filter((p) => p !== program.value) : [...values.programs, program.value],
                        );
                        touch('programs');
                      }}
                    />
                    <span>{program.label}</span>
                  </label>
                );
              })}
            </fieldset>
          ))}
        </div>
      </fieldset>

      <fieldset className={styles.section}>
        <legend className={styles.sectionTitle}>Your CV</legend>
        <Field
          id={id('cv')}
          label="CV / Resume"
          required
          hint="PDF or Word (.docx), up to 5 MB."
          error={errorFor('cv')}
          ok={isOk('cv', cvFile !== null)}
        >
          <input
            id={id('cv')}
            name="cv"
            type="file"
            accept={CV_ACCEPT}
            required
            aria-invalid={Boolean(errorFor('cv'))}
            aria-describedby={describedBy('cv', true)}
            onChange={(e) => {
              setCvFile(e.target.files?.[0] ?? null);
              touch('cv');
              if (serverErrors.cv) setServerErrors((current) => Object.fromEntries(Object.entries(current).filter(([k]) => k !== 'cv')));
            }}
            className={styles.file}
          />
        </Field>
        {cvFile && !errorFor('cv') && (
          <p className={styles.hint}>
            Selected: <strong>{cvFile.name}</strong> ({Math.max(1, Math.round(cvFile.size / 1024))} KB)
          </p>
        )}
      </fieldset>

      <fieldset className={styles.section}>
        <legend className={styles.sectionTitle}>How did you hear about us?</legend>
        <Field id={id('source')} label="Where did you hear about FloLabs?" required error={errorFor('source')}>
          <select
            id={id('source')}
            name="source"
            required
            value={values.source}
            aria-invalid={Boolean(errorFor('source'))}
            aria-describedby={describedBy('source')}
            onChange={(e) => set('source', e.target.value)}
            onBlur={() => touch('source')}
            className={styles.input}
          >
            <option value="">Choose…</option>
            {SOURCES.map((s) => (
              <option key={s.value} value={s.value}>
                {s.label}
              </option>
            ))}
          </select>
        </Field>
        {values.source === 'OTHER' &&
          text('sourceDetail', 'Where exactly?', { required: true, maxLength: LIMITS.sourceDetail })}
        {values.source === 'REFERRAL' &&
          text('referralName', 'Name of the person who referred you', {
            required: true,
            autoComplete: 'off',
            maxLength: LIMITS.referralName,
          })}
      </fieldset>

      <fieldset className={styles.section}>
        <legend className={styles.sectionTitle}>Confirmations</legend>
        <div className={styles.consent}>
          <label className={styles.check}>
            <input
              id={id('safeSenderConfirmed')}
              type="checkbox"
              name="safeSenderConfirmed"
              required
              checked={values.safeSenderConfirmed}
              aria-invalid={Boolean(errorFor('safeSenderConfirmed'))}
              aria-describedby={describedBy('safeSenderConfirmed')}
              onChange={(e) => {
                set('safeSenderConfirmed', e.target.checked);
                touch('safeSenderConfirmed');
              }}
            />
            <span>
              {CONSENT_TEXT.safeSender} <Required />
            </span>
          </label>
          {errorFor('safeSenderConfirmed') && (
            <ErrorText id={`${id('safeSenderConfirmed')}-error`}>{errorFor('safeSenderConfirmed')}</ErrorText>
          )}
        </div>
        <label className={styles.check}>
          <input
            type="checkbox"
            name="marketingOptIn"
            checked={values.marketingOptIn}
            onChange={(e) => set('marketingOptIn', e.target.checked)}
          />
          <span>{CONSENT_TEXT.marketing} (optional)</span>
        </label>
        <label className={styles.check}>
          <input
            type="checkbox"
            name="smsOptIn"
            checked={values.smsOptIn}
            onChange={(e) => set('smsOptIn', e.target.checked)}
          />
          <span>{CONSENT_TEXT.sms} (optional)</span>
        </label>
      </fieldset>

      <div className={styles.field} id={id('turnstile')} tabIndex={-1}>
        <Turnstile
          siteKey={turnstileSiteKey}
          action={TURNSTILE_ACTIONS.application}
          resetKey={turnstileReset}
          onToken={setTurnstileToken}
        />
        {errorFor('turnstile') && <ErrorText id={`${id('turnstile')}-error`}>{errorFor('turnstile')}</ErrorText>}
      </div>

      {formError && (
        <p className={styles.formError} role="alert">
          {formError}
        </p>
      )}

      <button type="submit" className={styles.submit} disabled={status === 'sending'}>
        {status === 'sending' ? 'Sending…' : 'Submit application'}
      </button>
    </form>
  );
}

type TextProps = {
  required?: boolean;
  type?: 'text' | 'email' | 'url';
  autoComplete?: string;
  inputMode?: 'text' | 'email' | 'url' | 'tel';
  maxLength?: number;
  hint?: string;
};
