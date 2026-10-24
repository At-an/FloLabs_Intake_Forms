import { getEnv } from '@/server/env';
import { LINK_FORM_TYPES, type LinkFormType } from '@/server/forms/link-tokens';
import { COUNTRIES } from '@/shared/config/countries';
import { prefillFor } from '@/shared/forms/engine';
import { LinkForm } from './LinkForm';
import { LinkGate } from './LinkGate';

// Server part of Forms 1-3: the gate checks the link, then the form gets the applicant's
// read-only details (D4) and programs. The token goes back with the answers for the server check.

export function LinkFormPage({ token, formType }: { token: string | string[] | undefined; formType: LinkFormType }) {
  const { label, path } = LINK_FORM_TYPES[formType];
  // Country names are built here once so server and browser render identical labels.
  const countries = formType === 'MASTERCLASS' ? COUNTRIES.map(({ value, label, callingCode }) => ({ value, label, callingCode })) : undefined;

  return (
    <LinkGate token={token} formType={formType}>
      {(application) => (
        <LinkForm
          formType={formType}
          title={label}
          endpoint={`/api/forms/${path}`}
          token={token as string}
          applicationId={application.id}
          programs={application.positionAppliedFor}
          prefill={prefillFor(application)}
          turnstileSiteKey={getEnv().TURNSTILE_SITE_KEY}
          countries={countries}
        />
      )}
    </LinkGate>
  );
}
