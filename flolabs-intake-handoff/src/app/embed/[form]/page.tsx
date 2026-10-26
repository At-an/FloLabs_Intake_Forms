import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { getEnv } from '@/server/env';
import { COUNTRIES } from '@/shared/config/countries';
import { EMBED_FORMS, type EmbedForm } from '@/shared/config/embed-forms';
import styles from '../../_components/form.module.css';
import { ApplicationForm } from '../../apply/ApplicationForm';
import { ContactUsForm } from './ContactUsForm';
import { EmbedFrame } from './EmbedFrame';
import { NewsletterForm } from './NewsletterForm';

// /embed/<form>?site=<site key>: the form shown inside the iframe that embed.js puts into a
// section of a FloLabs website (only those may frame it: src/shared/config/sites.ts). The site
// key is checked when the form is sent: only a known, active Site is accepted (src/server/sites.ts).

export const dynamic = 'force-dynamic';

const TITLES: Record<EmbedForm, string> = {
  application: 'Apply to a FloLabs program',
  'contact-us': 'Contact FloLabs',
  newsletter: 'FloLabs newsletter',
};

type Props = {
  params: Promise<{ form: string }>;
  searchParams: Promise<{ site?: string | string[] }>;
};

const isEmbedForm = (form: string): form is EmbedForm => (EMBED_FORMS as readonly string[]).includes(form);

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { form } = await params;
  return { title: isEmbedForm(form) ? TITLES[form] : 'FloLabs Forms' };
}

export default async function EmbedPage({ params, searchParams }: Props) {
  const { form } = await params;
  if (!isEmbedForm(form)) notFound();
  const { site } = await searchParams;
  const siteKey = typeof site === 'string' ? site.slice(0, 64) : undefined;
  const turnstileSiteKey = getEnv().TURNSTILE_SITE_KEY;

  return (
    <main className={styles.embed}>
      <EmbedFrame>
        {form === 'application' ? (
          <>
            <h1 className={styles.embedTitle}>{TITLES.application}</h1>
            <ApplicationForm
              siteKey={siteKey}
              countries={COUNTRIES.map(({ value, label, callingCode }) => ({ value, label, callingCode }))}
              turnstileSiteKey={turnstileSiteKey}
            />
          </>
        ) : form === 'newsletter' ? (
          <NewsletterForm siteKey={siteKey} turnstileSiteKey={turnstileSiteKey} />
        ) : (
          <ContactUsForm siteKey={siteKey} turnstileSiteKey={turnstileSiteKey} />
        )}
      </EmbedFrame>
    </main>
  );
}
