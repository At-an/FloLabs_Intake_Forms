import { parseEmailEnvironment } from '../src/server/env.ts';
import { createSqliteEmailStore, resolveLocalEmailDatabasePath } from '../src/server/email/mailbox.ts';

const env = parseEmailEnvironment(process.env);
if (process.env.NODE_ENV === 'production' || env.CRM_EMAIL_TEST_COMMANDS_ENABLED !== 'true') {
  console.error('Mailbox test inspection is disabled. Use a non-production environment and explicitly set CRM_EMAIL_TEST_COMMANDS_ENABLED=true.');
  process.exit(1);
}
if (!env.CRM_EMAIL_DATABASE_PATH) {
  console.error('Set CRM_EMAIL_DATABASE_PATH to inspect the local email test database.');
  process.exit(1);
}

const store = createSqliteEmailStore(resolveLocalEmailDatabasePath(env.CRM_EMAIL_DATABASE_PATH));
try {
  console.log(JSON.stringify(store.listMessages(), null, 2));
} finally {
  store.close();
}
