'use client';

import { useEffect, useId, useMemo, useRef, useState, useSyncExternalStore, type FormEvent, type ReactNode } from 'react';
import { HR_EMAIL, TURNSTILE_ACTIONS } from '@/shared/config/application';
import { KNOWN_DURATIONS, LINK_FORM_CONFIGS, REFERENCES_INTRO } from '@/shared/config/link-forms';
import { answerQuestions, isVisible, type AnswerQuestion, type FormType, type Prefill, type Question } from '@/shared/forms/engine';
import { fieldErrors } from '@/shared/forms/field-errors';
import { REFERENCE_KEYS, REFERENCE_LIMITS, buildLinkForm, linkFormSchema, type ReferenceKey } from '@/shared/forms/link-forms';
import { clearDraft, draftKey, loadDraft, saveDraft } from './draft';
import { ErrorText, Field, newSubmissionKey, Required } from './form-ui';
import styles from './form.module.css';
import { Turnstile } from './Turnstile';

// Forms 1-3 (T12-T14): renders the form the engine builds from the applicant's programs,
// keeps a draft in this browser while the applicant types, and posts to /api/forms/<form>.
// Forms 1 and 2 are multi-step (about you -> all track sections in one step -> closing) with
// Back/Next; Form 3 is one page. The whole form is still sent and checked once, at the end.

type Country = { value: string; label: string; callingCode: string };

type ReferenceValues = {
  fullName: string;
  title: string;
  organization: string;
  relationship: string;
  email: string;
  phoneCountry: string;
  phoneNumber: string;
  knownDuration: string;
};
type Values = { answers: Record<string, unknown>; references: Record<ReferenceKey, ReferenceValues> };
type DraftData = Values & { submissionKey: string; step?: number };
type Step = { title: string; sectionIds: readonly string[]; references: boolean; keys: readonly string[] };

const EMPTY_REFERENCE: ReferenceValues = {
  fullName: '',
  title: '',
  organization: '',
  relationship: '',
  email: '',
  phoneCountry: '',
  phoneNumber: '',
  knownDuration: '',
};
const REFERENCE_FIELDS = ['fullName', 'title', 'organization', 'relationship', 'email', 'phone.country', 'phone.number', 'knownDuration'] as const;

const DEFAULT_MAX_TEXT = 5000;
const GENERIC_ERROR = 'Something went wrong. Please try again later.';
const TURNSTILE_MESSAGE = 'Please complete the security check below.';

export type LinkFormProps = {
  formType: FormType;
  title: string;
  endpoint: string;
  token: string;
  applicationId: string;
  programs: readonly string[];
  prefill: Prefill;
  turnstileSiteKey: string;
  countries?: Country[];
};

const subscribeNothing = () => () => {};

/** The draft lives in browser storage, so the form renders in the browser only (no hydration mismatch). */
export function LinkForm(props: LinkFormProps) {
  const inBrowser = useSyncExternalStore(subscribeNothing, () => true, () => false);
  if (!inBrowser) {
    return (
      <section className={styles.card} aria-busy="true">
        <p>Loading the form…</p>
      </section>
    );
  }
  return <LinkFormInBrowser {...props} />;
}

function emptyValues(): Values {
  return { answers: {}, references: { R1: { ...EMPTY_REFERENCE }, R2: { ...EMPTY_REFERENCE } } };
}

/** UI values -> the request body the shared schema checks. */
function toRequest(questions: readonly AnswerQuestion[], values: Values, withReferences: boolean) {
  const answers: Record<string, unknown> = {};
  for (const q of questions) {
    const raw = values.answers[q.id];
    switch (q.kind) {
      case 'number':
        answers[q.id] = raw === undefined || raw === '' ? undefined : Number(raw);
        break;
      case 'links':
        answers[q.id] = ((raw as string[] | undefined) ?? []).map((url) => url.trim()).filter(Boolean);
        break;
      case 'multiselect':
        answers[q.id] = (raw as string[] | undefined) ?? [];
        break;
      case 'select':
      case 'radio':
        answers[q.id] = raw || undefined;
        break;
      case 'text':
      case 'textarea':
        answers[q.id] = raw ?? '';
        break;
      case 'yesno':
        answers[q.id] = raw;
        break;
    }
  }
  if (!withReferences) return { answers };
  const references = Object.fromEntries(
    REFERENCE_KEYS.map((key) => {
      const { phoneCountry, phoneNumber, knownDuration, ...rest } = values.references[key];
      return [key, { ...rest, phone: { country: phoneCountry, number: phoneNumber }, knownDuration: knownDuration || undefined }];
    }),
  );
  return { answers, references };
}

function LinkFormInBrowser({ formType, title, endpoint, token, applicationId, programs, prefill, turnstileSiteKey, countries = [] }: LinkFormProps) {
  const idPrefix = useId();
  const id = (key: string) => `${idPrefix}-${key.replaceAll('.', '-')}`;

  const form = useMemo(() => buildLinkForm(formType, programs), [formType, programs]);
  const schema = useMemo(() => linkFormSchema(form, { applicantEmail: prefill.email }), [form, prefill.email]);
  const questions = useMemo(() => answerQuestions(form), [form]);
  const withReferences = formType === 'MASTERCLASS';
  const multiStep = formType !== 'MASTERCLASS';
  const storageKey = draftKey(formType, applicationId);

  // Error keys per step, in the order the fields appear; Turnstile is on the last step.
  const steps = useMemo((): Step[] => {
    const keysOf = (sectionId: string) =>
      form.sections
        .find((s) => s.id === sectionId)!
        .groups.flatMap((g) => g.questions.filter((q) => q.kind !== 'display').map((q) => `answers.${q.id}`));
    const referenceKeys = REFERENCE_KEYS.flatMap((key) => REFERENCE_FIELDS.map((field) => `references.${key}.${field}`));
    const tracksTitle = LINK_FORM_CONFIGS[formType].tracksStepTitle ?? 'Your track';
    const stepOf = (sections: typeof form.sections, title: string): Step => ({
      title,
      sectionIds: sections.map((s) => s.id),
      references: false,
      keys: sections.flatMap((s) => keysOf(s.id)),
    });
    const list: Step[] = multiStep
      ? [
          ...form.sections.filter((s) => s.kind === 'intro').map((s) => stepOf([s], s.title)),
          stepOf(form.sections.filter((s) => s.kind === 'track'), tracksTitle),
          ...form.sections.filter((s) => s.kind === 'closing').map((s) => stepOf([s], s.title)),
        ].filter((step) => step.sectionIds.length > 0)
      : [
          {
            title: '',
            sectionIds: form.sections.map((s) => s.id),
            references: withReferences,
            keys: form.sections.flatMap((s) => [...(s.kind === 'closing' && withReferences ? referenceKeys : []), ...keysOf(s.id)]),
          },
        ];
    const last = list.length - 1;
    return list.map((step, index) => (index === last ? { ...step, keys: [...step.keys, 'turnstile'] } : step));
  }, [form, formType, multiStep, withReferences]);
  // Question names for the error summary ("Why are you interested… – Please answer this question.").
  const fieldNames = useMemo(() => {
    const names: Record<string, string> = { turnstile: 'Security check' };
    for (const q of questions) names[`answers.${q.id}`] = q.label.length > 70 ? `${q.label.slice(0, 67).trimEnd()}…` : q.label;
    const referenceNames: Record<(typeof REFERENCE_FIELDS)[number], string> = {
      fullName: 'Full name',
      title: 'Position / Title',
      organization: 'Organization / Institution',
      relationship: 'Relationship to you',
      email: 'Email address',
      'phone.country': 'Phone country code',
      'phone.number': 'Phone number',
      knownDuration: 'How long they have known you',
    };
    REFERENCE_KEYS.forEach((key, index) => {
      for (const field of REFERENCE_FIELDS) names[`references.${key}.${field}`] = `Reference ${index + 1}, ${referenceNames[field]}`;
    });
    return names;
  }, [questions]);
  const stepOf = (key: string) => Math.max(0, steps.findIndex((s) => s.keys.includes(key)));

  // Restore the unsent answers of an earlier visit on this device, if any.
  const [restored] = useState(() => loadDraft<DraftData>(storageKey, form.version));
  const [values, setValues] = useState<Values>(() => (restored ? { answers: restored.data.answers, references: restored.data.references } : emptyValues()));
  // Kept in the draft too: a retry after a reload still cannot create a second Form Submission.
  const [submissionKey] = useState(() => restored?.data.submissionKey ?? newSubmissionKey());
  const [restoredAt, setRestoredAt] = useState(restored?.savedAt ?? null);
  const [step, setStep] = useState(() => Math.min(Math.max(restored?.data.step ?? 0, 0), steps.length - 1));
  const [dirty, setDirty] = useState(false);
  const [draftStatus, setDraftStatus] = useState<'idle' | 'saved' | 'unavailable'>('idle');

  const [turnstileToken, setTurnstileToken] = useState<string | null>(null);
  const [turnstileReset, setTurnstileReset] = useState(0);
  const [touched, setTouched] = useState<ReadonlySet<string>>(new Set());
  // Steps the applicant tried to leave (Next) or send: their errors show even on untouched fields.
  const [attempted, setAttempted] = useState<ReadonlySet<number>>(new Set());
  const [serverErrors, setServerErrors] = useState<Partial<Record<string, string>>>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [status, setStatus] = useState<'idle' | 'sending' | 'done' | 'already'>('idle');
  const summaryRef = useRef<HTMLDivElement>(null);
  const topRef = useRef<HTMLFormElement>(null);
  const doneRef = useRef<HTMLHeadingElement>(null);

  // Save the draft shortly after each change (never before the applicant has typed anything).
  useEffect(() => {
    if (!dirty || status === 'done' || status === 'already') return;
    const timer = setTimeout(() => {
      setDraftStatus(saveDraft<DraftData>(storageKey, form.version, { ...values, submissionKey, step }) ? 'saved' : 'unavailable');
    }, 400);
    return () => clearTimeout(timer);
  }, [dirty, values, step, status, storageKey, form.version, submissionKey]);

  const request = useMemo(() => toRequest(questions, values, withReferences), [questions, values, withReferences]);
  const errors = useMemo((): Partial<Record<string, string>> => {
    const result = schema.safeParse({ ...request, submissionKey });
    return {
      ...(result.success ? {} : fieldErrors(result.error)),
      ...(!turnstileToken && { turnstile: TURNSTILE_MESSAGE }),
      ...serverErrors,
    };
  }, [schema, request, submissionKey, turnstileToken, serverErrors]);

  const current = steps[step]!;
  const isLast = step === steps.length - 1;
  const visibleErrors = current.keys.filter((key) => errors[key] && (attempted.has(step) || touched.has(key)));
  const errorFor = (key: string) => (visibleErrors.includes(key) ? errors[key] : undefined);
  const touch = (key: string) => setTouched((current) => (current.has(key) ? current : new Set(current).add(key)));
  const describedBy = (key: string, hint?: boolean) =>
    [hint && `${id(key)}-hint`, errorFor(key) && `${id(key)}-error`].filter(Boolean).join(' ') || undefined;

  function dropServerError(key: string) {
    if (serverErrors[key]) setServerErrors((current) => Object.fromEntries(Object.entries(current).filter(([k]) => k !== key)));
  }
  function setAnswer(questionId: string, value: unknown) {
    setValues((current) => ({ ...current, answers: { ...current.answers, [questionId]: value } }));
    setDirty(true);
    dropServerError(`answers.${questionId}`);
  }
  function setReference(key: ReferenceKey, field: keyof ReferenceValues, value: string, errorKey: string) {
    setValues((current) => ({ ...current, references: { ...current.references, [key]: { ...current.references[key], [field]: value } } }));
    setDirty(true);
    dropServerError(`references.${key}.${errorKey}`);
  }

  function onClearDraft() {
    if (!window.confirm('Clear all your answers from this device and start again?')) return;
    clearDraft(storageKey);
    setValues(emptyValues());
    setDirty(false);
    setRestoredAt(null);
    setDraftStatus('idle');
    setTouched(new Set());
    setAttempted(new Set());
    setServerErrors({});
    goToStep(0);
  }

  function goToStep(next: number) {
    // The Turnstile widget lives on the last step; a token from an unmounted widget is not reused.
    if (next !== steps.length - 1) setTurnstileToken(null);
    setStep(next);
    setFormError(null);
    if (multiStep) setDirty(true);
    requestAnimationFrame(() => topRef.current?.scrollIntoView({ block: 'start' }));
  }

  function focusFirstError(found: Partial<Record<string, string>>) {
    const first = steps.flatMap((s) => s.keys).find((key) => found[key]);
    if (!first) return;
    const target = stepOf(first);
    setAttempted((done) => new Set(done).add(target));
    if (target !== step) setStep(target);
    requestAnimationFrame(() => {
      summaryRef.current?.focus();
      document.getElementById(id(first))?.scrollIntoView({ block: 'center' });
    });
  }

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (status === 'sending') return;
    setFormError(null);

    // Next: only this step's questions must be valid.
    if (!isLast) {
      setAttempted((done) => new Set(done).add(step));
      if (current.keys.some((key) => errors[key])) {
        requestAnimationFrame(() => focusFirstError(errors));
        return;
      }
      goToStep(step + 1);
      return;
    }

    setAttempted(new Set(steps.map((_, index) => index)));
    const check = schema.safeParse({ ...request, submissionKey });
    if (!check.success || !turnstileToken) {
      focusFirstError({ ...(check.success ? {} : fieldErrors(check.error)), ...(!turnstileToken && { turnstile: TURNSTILE_MESSAGE }) });
      return;
    }

    setStatus('sending');
    try {
      const response = await fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...request, submissionKey, token, turnstileToken }),
      });
      const result = await response.json().catch(() => null);
      // The token was spent on this attempt; get a fresh one for any retry.
      setTurnstileReset((n) => n + 1);
      if (response.ok || response.status === 409) {
        clearDraft(storageKey);
        setStatus(response.ok ? 'done' : 'already');
        requestAnimationFrame(() => doneRef.current?.focus());
        return;
      }
      setStatus('idle');
      if (response.status === 400 && result?.error?.fields) {
        setServerErrors(result.error.fields);
        focusFirstError(result.error.fields);
      }
      setFormError(typeof result?.error?.message === 'string' ? result.error.message : GENERIC_ERROR);
    } catch {
      setStatus('idle');
      setTurnstileReset((n) => n + 1);
      setFormError('We could not reach the server. Your answers are still here. Check your connection and try again.');
    }
  }

  if (status === 'done' || status === 'already') {
    return (
      <section className={styles.card} aria-live="polite">
        <h2 ref={doneRef} tabIndex={-1} className={styles.doneTitle}>
          {status === 'done' ? `Thank you, ${prefill.fullName}! Your answers were sent.` : 'You have already sent this form.'}
        </h2>
        <p>
          {status === 'done' ? 'We have received your answers.' : 'Thank you, we have your answers.'} We will contact you at{' '}
          <strong>{prefill.email}</strong> from <strong>{HR_EMAIL}</strong>.
        </p>
      </section>
    );
  }

  const renderQuestion = (q: Question): ReactNode => {
    if (q.kind === 'display') {
      return (
        <blockquote key={q.id} className={styles.snippet}>
          {q.text}
        </blockquote>
      );
    }
    if (!isVisible(q, values.answers)) return null;
    const key = `answers.${q.id}`;
    const raw = values.answers[q.id];
    const error = errorFor(key);
    const common = { 'aria-invalid': Boolean(error), 'aria-describedby': describedBy(key, Boolean(q.help)) };

    switch (q.kind) {
      case 'text':
      case 'textarea': {
        const text = (raw as string | undefined) ?? '';
        const max = q.maxLength ?? DEFAULT_MAX_TEXT;
        const props = {
          id: id(key),
          name: q.id,
          maxLength: max,
          required: q.required,
          value: text,
          onChange: (e: { target: { value: string } }) => setAnswer(q.id, e.target.value),
          onBlur: () => touch(key),
          ...common,
        };
        return (
          <Field key={q.id} id={id(key)} label={q.label} required={q.required} hint={q.help} error={error}>
            {q.kind === 'text' ? (
              <input type="text" className={styles.input} {...props} />
            ) : (
              <textarea rows={5} className={`${styles.input} ${styles.textarea}`} {...props} />
            )}
          </Field>
        );
      }
      case 'number':
        return (
          <Field key={q.id} id={id(key)} label={q.label} required={q.required} hint={q.help} error={error}>
            <input
              id={id(key)}
              name={q.id}
              type="number"
              inputMode="numeric"
              min={q.min}
              max={q.max}
              step={1}
              required={q.required}
              value={(raw as string | undefined) ?? ''}
              onChange={(e) => setAnswer(q.id, e.target.value)}
              onBlur={() => touch(key)}
              className={`${styles.input} ${styles.number}`}
              {...common}
            />
          </Field>
        );
      case 'select':
        return (
          <Field key={q.id} id={id(key)} label={q.label} required={q.required} hint={q.help} error={error}>
            <select
              id={id(key)}
              name={q.id}
              required={q.required}
              value={(raw as string | undefined) ?? ''}
              onChange={(e) => setAnswer(q.id, e.target.value)}
              onBlur={() => touch(key)}
              className={styles.input}
              {...common}
            >
              <option value="">Choose…</option>
              {q.options.map((o) => (
                <option key={o.value} value={o.value}>
                  {o.label}
                </option>
              ))}
            </select>
          </Field>
        );
      case 'radio':
      case 'yesno': {
        const options = q.kind === 'yesno' ? [{ value: 'true', label: 'Yes' }, { value: 'false', label: 'No' }] : q.options;
        const current = q.kind === 'yesno' ? (raw === undefined ? '' : String(raw)) : ((raw as string | undefined) ?? '');
        return (
          <Choices key={q.id} id={id(key)} label={q.label} required={q.required} hint={q.help} error={error} describedBy={common['aria-describedby']}>
            {options.map((o) => (
              <label key={o.value} className={`${styles.check} ${styles.option}`}>
                <input
                  type="radio"
                  name={`${idPrefix}-${q.id}`}
                  value={o.value}
                  checked={current === o.value}
                  onChange={() => {
                    setAnswer(q.id, q.kind === 'yesno' ? o.value === 'true' : o.value);
                    touch(key);
                  }}
                />
                <span>{o.label}</span>
              </label>
            ))}
          </Choices>
        );
      }
      case 'multiselect': {
        const chosen = (raw as string[] | undefined) ?? [];
        return (
          <Choices key={q.id} id={id(key)} label={q.label} required={q.required} hint={q.help} error={error} describedBy={common['aria-describedby']}>
            <div className={styles.options}>
              {q.options.map((o) => {
                const checked = chosen.includes(o.value);
                return (
                  <label key={o.value} className={`${styles.check} ${styles.option}`}>
                    <input
                      type="checkbox"
                      value={o.value}
                      checked={checked}
                      onChange={() => {
                        setAnswer(q.id, checked ? chosen.filter((v) => v !== o.value) : [...chosen, o.value]);
                        touch(key);
                      }}
                    />
                    <span>{o.label}</span>
                  </label>
                );
              })}
            </div>
          </Choices>
        );
      }
      case 'links': {
        const links = (raw as string[] | undefined)?.length ? (raw as string[]) : [''];
        const hint = q.help ?? `Full links starting with https://. Up to ${q.maxItems}.`;
        return (
          <Choices key={q.id} id={id(key)} label={q.label} required={q.required} hint={hint} error={error} describedBy={describedBy(key, true)}>
            {links.map((url, index) => (
              <div key={index} className={styles.linkRow}>
                <input
                  type="url"
                  inputMode="url"
                  aria-label={`${q.label} (link ${index + 1})`}
                  placeholder="https://"
                  maxLength={500}
                  value={url}
                  onChange={(e) => setAnswer(q.id, links.map((v, i) => (i === index ? e.target.value : v)))}
                  onBlur={() => touch(key)}
                  aria-invalid={Boolean(error)}
                  className={styles.input}
                />
                {links.length > 1 && (
                  <button type="button" className={styles.secondary} onClick={() => setAnswer(q.id, links.filter((_, i) => i !== index))}>
                    Remove
                  </button>
                )}
              </div>
            ))}
            {links.length < q.maxItems && (
              <button type="button" className={styles.secondary} onClick={() => setAnswer(q.id, [...links, ''])}>
                Add another link
              </button>
            )}
          </Choices>
        );
      }
    }
  };

  const referenceInput = (key: ReferenceKey, field: Exclude<keyof ReferenceValues, 'phoneCountry' | 'phoneNumber' | 'knownDuration'>, label: string, props: { type?: 'text' | 'email'; maxLength: number }) => {
    const errorKey = `references.${key}.${field}`;
    return (
      <Field id={id(errorKey)} label={label} required error={errorFor(errorKey)}>
        <input
          id={id(errorKey)}
          type={props.type ?? 'text'}
          autoComplete="off"
          maxLength={props.maxLength}
          required
          value={values.references[key][field]}
          aria-invalid={Boolean(errorFor(errorKey))}
          aria-describedby={describedBy(errorKey)}
          onChange={(e) => setReference(key, field, e.target.value, field)}
          onBlur={() => touch(errorKey)}
          className={styles.input}
        />
      </Field>
    );
  };

  const referencesBlock = (
    <fieldset className={styles.section} key="references">
      <legend className={styles.sectionTitle}>References</legend>
      {REFERENCES_INTRO.map((line) => (
        <p key={line} className={styles.hint}>
          {line}
        </p>
      ))}
      {REFERENCE_KEYS.map((key, index) => {
        const ref = values.references[key];
        const k = (field: string) => `references.${key}.${field}`;
        return (
          <fieldset key={key} className={styles.track}>
            <legend className={styles.trackTitle}>Reference {index + 1}</legend>
            {referenceInput(key, 'fullName', 'Full name', { maxLength: REFERENCE_LIMITS.fullName })}
            <div className={styles.row}>
              {referenceInput(key, 'title', 'Position / Title', { maxLength: REFERENCE_LIMITS.title })}
              {referenceInput(key, 'organization', 'Organization / Institution', { maxLength: REFERENCE_LIMITS.organization })}
            </div>
            {referenceInput(key, 'relationship', 'Relationship to you', { maxLength: REFERENCE_LIMITS.relationship })}
            {referenceInput(key, 'email', 'Email address', { type: 'email', maxLength: REFERENCE_LIMITS.email })}
            <div className={styles.row}>
              <Field id={id(k('phone.country'))} label="Phone country code (optional)" error={errorFor(k('phone.country'))}>
                <select
                  id={id(k('phone.country'))}
                  value={ref.phoneCountry}
                  aria-invalid={Boolean(errorFor(k('phone.country')))}
                  aria-describedby={describedBy(k('phone.country'))}
                  onChange={(e) => setReference(key, 'phoneCountry', e.target.value, 'phone.country')}
                  onBlur={() => touch(k('phone.country'))}
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
              <Field id={id(k('phone.number'))} label="Phone number, if available" error={errorFor(k('phone.number'))}>
                <input
                  id={id(k('phone.number'))}
                  type="tel"
                  inputMode="tel"
                  autoComplete="off"
                  maxLength={30}
                  value={ref.phoneNumber}
                  aria-invalid={Boolean(errorFor(k('phone.number')))}
                  aria-describedby={describedBy(k('phone.number'))}
                  onChange={(e) => setReference(key, 'phoneNumber', e.target.value, 'phone.number')}
                  onBlur={() => touch(k('phone.number'))}
                  className={styles.input}
                />
              </Field>
            </div>
            <Field id={id(k('knownDuration'))} label="How long have they known or worked with you?" required error={errorFor(k('knownDuration'))}>
              <select
                id={id(k('knownDuration'))}
                required
                value={ref.knownDuration}
                aria-invalid={Boolean(errorFor(k('knownDuration')))}
                aria-describedby={describedBy(k('knownDuration'))}
                onChange={(e) => setReference(key, 'knownDuration', e.target.value, 'knownDuration')}
                onBlur={() => touch(k('knownDuration'))}
                className={styles.input}
              >
                <option value="">Choose…</option>
                {KNOWN_DURATIONS.map((o) => (
                  <option key={o.value} value={o.value}>
                    {o.label}
                  </option>
                ))}
              </select>
            </Field>
          </fieldset>
        );
      })}
    </fieldset>
  );

  return (
    <form ref={topRef} className={`${styles.card} ${styles.stepForm}`} onSubmit={onSubmit} noValidate aria-busy={status === 'sending'} aria-label={title}>
      {multiStep && (
        <div className={styles.progressBar} aria-hidden="true">
          <span style={{ width: `${((step + 1) / steps.length) * 100}%` }} />
        </div>
      )}
      {step > 0 && (
        <button type="button" className={styles.backArrow} onClick={() => goToStep(step - 1)} disabled={status === 'sending'} aria-label="Back to the previous step">
          <svg viewBox="0 0 24 24" width="26" height="26" aria-hidden="true">
            <path d="M20 12H5M11 18l-6-6 6-6" fill="none" stroke="currentColor" strokeWidth="2.25" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </button>
      )}
      <section className={styles.applicant} aria-label="Your details">
        <dl className={styles.prefill}>
          <dt>Full name</dt>
          <dd>{prefill.fullName || '—'}</dd>
          <dt>Email</dt>
          <dd>{prefill.email || '—'}</dd>
          <dt>Program{prefill.programs.length === 1 ? '' : 's'} applied for</dt>
          <dd>{prefill.programs.join(', ') || '—'}</dd>
        </dl>
        {formType === 'CONTACTED' &&
          step === 0 &&
          form.trackStatements.map((s) => (
            <p key={s.program} className={styles.statement}>
              {s.text}
            </p>
          ))}
        {step === 0 && <p className={styles.hint}>These details come from your application. If something is wrong, write to {HR_EMAIL}.</p>}
      </section>

      {multiStep && (
        <nav aria-label="Form steps" className={styles.progress}>
          <p className={styles.stepCount}>
            Step {step + 1} of {steps.length}
          </p>
          <ol className={styles.steps}>
            {steps.map((s, index) => (
              <li key={s.title} className={index === step ? styles.stepCurrent : index < step ? styles.stepDone : undefined} aria-current={index === step ? 'step' : undefined}>
                {index < step ? (
                  <button type="button" className={styles.stepLink} onClick={() => goToStep(index)}>
                    {s.title}
                  </button>
                ) : (
                  <span>{s.title}</span>
                )}
              </li>
            ))}
          </ol>
        </nav>
      )}

      <div ref={summaryRef} tabIndex={-1} className={styles.summaryAnchor}>
        {attempted.has(step) && visibleErrors.length > 0 && (
          <div className={styles.summary} role="alert">
            <h2 className={styles.summaryTitle}>
              Please fix {visibleErrors.length === 1 ? 'this answer' : `these ${visibleErrors.length} answers`}:
            </h2>
            <ul>
              {visibleErrors.map((key) => (
                <li key={key}>
                  <a href={`#${id(key)}`}>
                    <strong>{fieldNames[key]}</strong> – {errors[key]}
                  </a>
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>

      {form.sections
        .filter((section) => current.sectionIds.includes(section.id))
        .map((section) => [
          section.kind === 'closing' && current.references ? referencesBlock : null,
          <fieldset key={section.id} className={styles.section}>
            <legend className={styles.sectionTitle}>{section.title}</legend>
            {section.groups.map((group, index) =>
              group.title ? (
                <fieldset key={group.title} className={styles.track}>
                  <legend className={styles.trackTitle}>{group.title}</legend>
                  {group.questions.map(renderQuestion)}
                </fieldset>
              ) : (
                <div key={`group-${index}`}>{group.questions.map(renderQuestion)}</div>
              ),
            )}
          </fieldset>,
        ])}

      {isLast && (
        <div className={styles.field} id={id('turnstile')} tabIndex={-1}>
          <Turnstile siteKey={turnstileSiteKey} action={TURNSTILE_ACTIONS[formType]} resetKey={turnstileReset} onToken={setTurnstileToken} />
          {errorFor('turnstile') && <ErrorText id={`${id('turnstile')}-error`}>{errorFor('turnstile')}</ErrorText>}
        </div>
      )}

      {formError && (
        <p className={styles.formError} role="alert">
          {formError}
        </p>
      )}

      <div className={styles.stepButtons}>
        {step > 0 && (
          <button type="button" className={styles.secondary} onClick={() => goToStep(step - 1)} disabled={status === 'sending'}>
            Back
          </button>
        )}
        <button type="submit" className={styles.submit} disabled={status === 'sending'}>
          {!isLast ? 'Next' : status === 'sending' ? 'Sending…' : 'Send my answers'}
        </button>
      </div>

      <p className={styles.draftLine}>
        {restoredAt && <>We restored the answers you had not sent yet. </>}
        {draftStatus === 'unavailable'
          ? 'Your browser does not allow saving a draft, so please complete the form in one visit.'
          : 'Your answers are saved on this device until you send them.'}{' '}
        <button type="button" className={styles.linkButton} onClick={onClearDraft}>
          Clear my draft
        </button>
      </p>
    </form>
  );
}

/** A question answered with radios, checkboxes or a list of inputs: a fieldset with a legend. */
function Choices({
  id,
  label,
  required,
  hint,
  error,
  describedBy,
  children,
}: {
  id: string;
  label: string;
  required: boolean;
  hint?: string;
  error?: string;
  describedBy?: string;
  children: ReactNode;
}) {
  return (
    <fieldset id={id} tabIndex={-1} className={`${styles.field} ${styles.choices}`} aria-describedby={describedBy} aria-invalid={Boolean(error)}>
      <legend className={styles.label}>
        {label} {required && <Required />}
      </legend>
      {hint && (
        <p id={`${id}-hint`} className={styles.hint}>
          {hint}
        </p>
      )}
      {children}
      {error && <ErrorText id={`${id}-error`}>{error}</ErrorText>}
    </fieldset>
  );
}
