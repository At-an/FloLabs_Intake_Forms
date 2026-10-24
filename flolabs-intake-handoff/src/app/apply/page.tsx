import type { Metadata } from 'next';
import { getEnv } from '@/server/env';
import { COUNTRIES } from '@/shared/config/countries';
import { ApplicationForm } from './ApplicationForm';
import styles from '../_components/form.module.css';

export const metadata: Metadata = { title: 'Apply | FloLabs' };

type Props = { searchParams: Promise<{ site?: string | string[] }> };

export default async function ApplyPage({ searchParams }: Props) {
  const { site } = await searchParams;
  // Passed through as-is; the server validates it against the active Sites (spec section 1).
  const siteKey = typeof site === 'string' ? site.slice(0, 64) : undefined;
  // Country names are built here once so server and browser render identical labels.
  const countries = COUNTRIES.map(({ value, label, callingCode }) => ({ value, label, callingCode }));

  return (
    <main className={styles.page}>
      <header className={styles.header}>
        <h1>Apply to a FloLabs program</h1>
        <p className={styles.lead}>
          Fields marked <span aria-hidden="true">*</span>
          <span className={styles.srOnly}>with an asterisk</span> are required. It takes about 5 minutes.
        </p>
      </header>
      <ApplicationForm siteKey={siteKey} countries={countries} turnstileSiteKey={getEnv().TURNSTILE_SITE_KEY} />
    </main>
  );
}
