import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { getEnv } from '@/server/env';
import { findActiveSite } from '@/server/public-post';
import { getTwentyClient } from '@/server/twenty';
import { EMBED_FORMS, type EmbedForm } from '@/shared/config/embed-forms';
import styles from '../../_components/form.module.css';
import { ContactUsForm } from './ContactUsForm';
import { EmbedFrame } from './EmbedFrame';
import { NewsletterForm } from './NewsletterForm';

export const dynamic = 'force-dynamic';

type Props = {
  params: Promise<{ form: string }>;
  searchParams: Promise<{ site?: string | string[] }>;
};

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { form } = await params;
  return { title: form === 'newsletter' ? 'FloLabs newsletter' : 'Contact FloLabs' };
}

export default async function EmbedPage({ params, searchParams }: Props) {
  const { form } = await params;
  if (!EMBED_FORMS.includes(form as EmbedForm)) notFound();
  const { site } = await searchParams;
  const siteKey = typeof site === 'string' ? site : undefined;

  // Only active, allow-listed Sites get a form (CLAUDE.md section 5). The server re-checks on submit.
  const active = await findActiveSite(getTwentyClient(), siteKey).catch(() => null);

  return (
    <main className={styles.embed}>
      <EmbedFrame>
        {!active || !siteKey ? (
          <p className={styles.lead}>This form is not available on this website.</p>
        ) : form === 'newsletter' ? (
          <NewsletterForm siteKey={siteKey} turnstileSiteKey={getEnv().TURNSTILE_SITE_KEY} />
        ) : (
          <ContactUsForm siteKey={siteKey} turnstileSiteKey={getEnv().TURNSTILE_SITE_KEY} />
        )}
      </EmbedFrame>
    </main>
  );
}
