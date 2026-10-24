import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { getEnv } from '@/server/env';
import { LINK_FORM_TYPES, type LinkFormType } from '@/server/forms/link-tokens';
import { COUNTRIES } from '@/shared/config/countries';
import { PROGRAMS } from '@/shared/config/programs';
import { prefillFor } from '@/shared/forms/engine';
import { LinkForm } from '../../_components/LinkForm';
import styles from '../../_components/form.module.css';

// Development-only preview of Forms 1-3 for any set of programs, without a signed link or
// Twenty. Sending is refused by the server (no valid link), so no record is ever created.
export const metadata: Metadata = { title: 'Link form preview' };

const PREVIEW_APPLICATION_ID = '00000000-0000-4000-8000-000000000000';

type Props = { searchParams: Promise<{ form?: string; programs?: string }> };

export default async function LinkFormPreviewPage({ searchParams }: Props) {
  if (process.env.NODE_ENV === 'production') notFound();
  const { form = 'contacted', programs = 'UI_UX_DESIGN_INTERN' } = await searchParams;
  const entry = Object.entries(LINK_FORM_TYPES).find(([, v]) => v.path === form);
  if (!entry) notFound();
  const [formType, { title, lead, path }] = entry as [LinkFormType, (typeof LINK_FORM_TYPES)[LinkFormType]];
  const chosen = programs.split(',').filter((p) => PROGRAMS.some((program) => program.value === p));

  return (
    <main className={styles.page}>
      <header className={styles.header}>
        <h1>{title}</h1>
        <p className={styles.lead}>{lead}</p>
        <p className={styles.lead}>
          Preview (development only). Try <code>?form=before-meeting</code> or <code>?form=masterclass</code>, and{' '}
          <code>&amp;programs=AI_AGI_INTERN,FINANCE_INTERN</code>.
        </p>
      </header>
      <LinkForm
        formType={formType}
        title={title}
        endpoint={`/api/forms/${path}`}
        token="preview"
        applicationId={PREVIEW_APPLICATION_ID}
        programs={chosen}
        prefill={prefillFor({
          positionAppliedFor: chosen,
          person: { name: { firstName: 'Atankeu', lastName: 'Natanahel' }, emails: { primaryEmail: 'zoom+t5test@flomadlabs.com' } },
        })}
        turnstileSiteKey={getEnv().TURNSTILE_SITE_KEY}
        countries={COUNTRIES.map(({ value, label: country, callingCode }) => ({ value, label: country, callingCode }))}
      />
    </main>
  );
}
