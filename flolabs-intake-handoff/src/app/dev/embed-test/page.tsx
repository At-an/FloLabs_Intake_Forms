import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import Script from 'next/script';
import styles from '../../_components/form.module.css';

// Development-only page that embeds both forms exactly like a FloLabs website would.
export const metadata: Metadata = { title: 'Embed test' };

type Props = { searchParams: Promise<{ site?: string }> };

export default async function EmbedTestPage({ searchParams }: Props) {
  if (process.env.NODE_ENV === 'production') notFound();
  const { site = 'flolabs_international' } = await searchParams;

  return (
    <main className={styles.page}>
      <h1>Embed test (development only)</h1>
      <p className={styles.lead}>
        Site key: <code>{site}</code>. Try <code>?site=flomad</code> (inactive) or <code>?site=nope</code> (unknown).
      </p>
      <h2>Contact Us</h2>
      <div data-flolabs-form="contact-us" data-site={site} />
      <h2>Newsletter</h2>
      <div data-flolabs-form="newsletter" data-site={site} />
      <Script src="/embed.js" strategy="afterInteractive" />
    </main>
  );
}
