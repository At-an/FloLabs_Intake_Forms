import type { ReactNode } from 'react';
import { getEnv } from '@/server/env';
import { LINK_FORM_TYPES, LINK_VALIDITY_DAYS, type LinkFormType } from '@/server/forms/link-tokens';
import { openFormLink } from '@/server/forms/open-link';
import { logger } from '@/server/logger';
import { getTwentyClient } from '@/server/twenty';
import type { ApplicationForLink } from '@/server/twenty/types';
import { HR_EMAIL } from '@/shared/config/application';
import styles from './form.module.css';

// Server component in front of Forms 1-3 (T10): only a valid, unused link shows the form.

const MESSAGES = {
  INVALID: {
    title: 'This link is not valid',
    text: `Please open the exact link from your email. If it still does not work, write to ${HR_EMAIL}.`,
  },
  EXPIRED: {
    title: 'This link has expired',
    text: `Links are valid for ${LINK_VALIDITY_DAYS} days. Please write to ${HR_EMAIL} and we'll send you a new one.`,
  },
  NOT_FOUND: {
    title: 'We could not find your application',
    text: `Please write to ${HR_EMAIL} and we will send you a new link.`,
  },
  USED: {
    title: 'You have already sent this form',
    text: `Thank you, we have your answers. If you need to change something, write to ${HR_EMAIL}.`,
  },
  UNAVAILABLE: {
    title: 'This form is temporarily unavailable',
    text: 'Please try again in a little while.',
  },
} as const;

export async function LinkGate({
  token,
  formType,
  children,
}: {
  token: string | string[] | undefined;
  formType: LinkFormType;
  children: (application: ApplicationForLink) => ReactNode;
}) {
  const result = await openFormLink(typeof token === 'string' ? token : undefined, formType, {
    twenty: getTwentyClient(),
    logger,
    secret: getEnv().LINK_TOKEN_SECRET,
  });

  // A valid link shows the form, which draws its own header on every step.
  return (
    <main className={styles.page}>
      {result.ok ? (
        children(result.application)
      ) : (
        <>
          <header className={styles.header}>
            <h1>{LINK_FORM_TYPES[formType].title}</h1>
          </header>
          <section className={styles.card} role="status">
            <h2 className={styles.summaryTitle}>{MESSAGES[result.reason].title}</h2>
            <p>{MESSAGES[result.reason].text}</p>
          </section>
        </>
      )}
    </main>
  );
}
