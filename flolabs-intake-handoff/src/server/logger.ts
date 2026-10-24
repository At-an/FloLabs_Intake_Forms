import 'server-only';

// Structured JSON logs with record IDs and error codes only (CLAUDE.md rule 7).
// The type limits callers to these fields; the runtime checks below redact anything
// that is not an ID, code or number, in case a value is cast or mislabelled.

export type LogLevel = 'info' | 'warn' | 'error';

type IdField = 'requestId' | 'recordId' | 'personId' | 'applicationId' | 'siteId' | 'submissionKey';
type CodeField = 'op' | 'code' | 'form';
type NumberField = 'status' | 'durationMs';

export type LogFields = Partial<Record<IdField, string> & Record<CodeField, string> & Record<NumberField, number>>;

const ID_FIELDS: ReadonlySet<string> = new Set<IdField>([
  'requestId',
  'recordId',
  'personId',
  'applicationId',
  'siteId',
  'submissionKey',
]);
const CODE_FIELDS: ReadonlySet<string> = new Set<CodeField>(['op', 'code', 'form']);
const NUMBER_FIELDS: ReadonlySet<string> = new Set<NumberField>(['status', 'durationMs']);

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
// Codes look like `twenty.findPersonByEmail` or `UPSTREAM_UNAVAILABLE`; no spaces, no '@', no '+'.
const CODE = /^[A-Za-z][A-Za-z0-9_.:-]{0,63}$/;
const REDACTED = '[redacted]';

function sanitize(fields: Record<string, unknown>): Record<string, string | number> {
  const clean: Record<string, string | number> = {};
  for (const [key, value] of Object.entries(fields)) {
    if (value === undefined) continue;
    if (ID_FIELDS.has(key)) clean[key] = typeof value === 'string' && UUID.test(value) ? value : REDACTED;
    else if (CODE_FIELDS.has(key)) clean[key] = typeof value === 'string' && CODE.test(value) ? value : REDACTED;
    else if (NUMBER_FIELDS.has(key)) clean[key] = typeof value === 'number' && Number.isFinite(value) ? value : REDACTED;
    // Unknown keys are dropped.
  }
  return clean;
}

export type Logger = Record<LogLevel, (event: string, fields?: LogFields) => void>;

export function createLogger(write: (line: string) => void = (line) => console.log(line)): Logger {
  const emit = (level: LogLevel) => (event: string, fields: LogFields = {}) => {
    write(
      JSON.stringify({
        ts: new Date().toISOString(),
        level,
        event: CODE.test(event) ? event : REDACTED,
        ...sanitize(fields),
      }),
    );
  };
  return { info: emit('info'), warn: emit('warn'), error: emit('error') };
}

export const logger = createLogger();
