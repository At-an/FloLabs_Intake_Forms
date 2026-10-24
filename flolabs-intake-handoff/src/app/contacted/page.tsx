import type { Metadata } from 'next';
import { LINK_FORM_TYPES } from '@/server/forms/link-tokens';
import { LinkGate } from '../_components/LinkGate';
import styles from '../_components/form.module.css';

export const metadata: Metadata = { title: `${LINK_FORM_TYPES.CONTACTED.label} | FloLabs` };
export const dynamic = 'force-dynamic';

type Props = { searchParams: Promise<{ t?: string | string[] }> };

export default async function Page({ searchParams }: Props) {
  const { t } = await searchParams;
  return (
    <LinkGate token={t} formType="CONTACTED">
      {(application) => (
        // The form itself is built in T12-T14 from the T11 form engine.
        <section className={styles.card}>
          <p>
            Hello {application.person?.name?.firstName ?? 'there'}, your link is valid. The form will appear here.
          </p>
        </section>
      )}
    </LinkGate>
  );
}
