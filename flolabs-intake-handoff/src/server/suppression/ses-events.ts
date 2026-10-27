import { normalizeEmail } from './normalize';
import type { SuppressionRecord, SuppressionStore } from './types';

type JsonObject = Record<string, unknown>;

export type SesSnsRecord = {
  EventSource: string;
  Sns: { Type: string; TopicArn: string; MessageId: string; Message: string };
};

export type SesEventResult = { outcome: 'PROCESSED' | 'DUPLICATE' | 'IGNORED'; suppressions: number };

export class SesEventError extends Error {
  constructor(readonly code: 'INVALID_ENVELOPE' | 'INVALID_PAYLOAD' | 'WRONG_TOPIC' | 'STORE_FAILURE') {
    super(code);
    this.name = 'SesEventError';
  }
}

const object = (value: unknown): value is JsonObject => !!value && typeof value === 'object' && !Array.isArray(value);

function requiredObject(parent: JsonObject, key: string): JsonObject {
  const value = parent[key];
  if (!object(value)) throw new SesEventError('INVALID_PAYLOAD');
  return value;
}

function requiredString(parent: JsonObject, key: string): string {
  const value = parent[key];
  if (typeof value !== 'string' || !value.trim()) throw new SesEventError('INVALID_PAYLOAD');
  return value;
}

function recipients(parent: JsonObject, key: string): string[] {
  const value = parent[key];
  if (!Array.isArray(value) || value.length === 0 || value.some((entry) => !object(entry) || typeof entry.emailAddress !== 'string')) {
    throw new SesEventError('INVALID_PAYLOAD');
  }
  try {
    return value.map((entry) => normalizeEmail(entry.emailAddress as string));
  } catch {
    throw new SesEventError('INVALID_PAYLOAD');
  }
}

function emailAddresses(value: unknown): string[] {
  if (!Array.isArray(value) || value.length === 0) {
    throw new SesEventError('INVALID_PAYLOAD');
  }
  const addresses = value.filter((entry): entry is string => typeof entry === 'string');
  if (addresses.length !== value.length) throw new SesEventError('INVALID_PAYLOAD');
  try {
    return addresses.map(normalizeEmail);
  } catch {
    throw new SesEventError('INVALID_PAYLOAD');
  }
}

export async function processSesSnsRecord(
  value: unknown,
  deps: { store: SuppressionStore; expectedTopicArn: string; now?: () => Date },
): Promise<SesEventResult> {
  if (!object(value) || value.EventSource !== 'aws:sns' || !object(value.Sns)) {
    throw new SesEventError('INVALID_ENVELOPE');
  }
  const sns = value.Sns;
  if (
    sns.Type !== 'Notification' ||
    sns.TopicArn !== deps.expectedTopicArn ||
    typeof sns.MessageId !== 'string' ||
    !sns.MessageId ||
    typeof sns.Message !== 'string'
  ) {
    throw new SesEventError(sns.TopicArn !== deps.expectedTopicArn ? 'WRONG_TOPIC' : 'INVALID_ENVELOPE');
  }

  const eventId = `${sns.TopicArn}:${sns.MessageId}`;

  let event: unknown;
  try {
    event = JSON.parse(sns.Message);
  } catch {
    throw new SesEventError('INVALID_PAYLOAD');
  }
  if (!object(event)) throw new SesEventError('INVALID_PAYLOAD');

  const eventType = typeof event.eventType === 'string' ? event.eventType : event.notificationType;
  if (typeof eventType !== 'string' || !eventType.trim()) throw new SesEventError('INVALID_PAYLOAD');
  const mail = requiredObject(event, 'mail');
  requiredString(mail, 'messageId');

  const toSuppress: SuppressionRecord[] = [];
  let ignored = false;
  if (eventType === 'Bounce') {
    const bounce = requiredObject(event, 'bounce');
    const bounceType = requiredString(bounce, 'bounceType');
    const addresses = recipients(bounce, 'bouncedRecipients');
    if (bounceType === 'Permanent') {
      for (const email of addresses) {
        toSuppress.push({
          email,
          normalizedEmail: email,
          reason: 'HARD_BOUNCE',
          scope: 'ALL_MARKETING',
          eventId,
          source: 'SES_EVENT',
          ...(typeof bounce.timestamp === 'string' && { occurredAt: bounce.timestamp }),
        });
      }
    } else if (bounceType === 'Transient' || bounceType === 'Undetermined') {
      ignored = true;
    } else {
      throw new SesEventError('INVALID_PAYLOAD');
    }
  } else if (eventType === 'Complaint') {
    const complaint = requiredObject(event, 'complaint');
    const addresses = recipients(complaint, 'complainedRecipients');
    for (const email of addresses) {
      toSuppress.push({
        email,
        normalizedEmail: email,
        reason: 'COMPLAINT',
        scope: 'ALL_MARKETING',
        eventId,
        source: 'SES_EVENT',
        ...(typeof complaint.timestamp === 'string' && { occurredAt: complaint.timestamp }),
      });
    }
  } else if (eventType === 'Delivery') {
    const delivery = requiredObject(event, 'delivery');
    emailAddresses(delivery.recipients);
  } else if (eventType === 'Reject') {
    const reject = requiredObject(event, 'reject');
    requiredString(reject, 'reason');
  } else if (eventType === 'DeliveryDelay') {
    requiredObject(event, 'deliveryDelay');
    ignored = true;
  } else {
    ignored = true;
  }

  let alreadyProcessed: boolean;
  try {
    alreadyProcessed = await deps.store.isEventProcessed(eventId);
  } catch {
    throw new SesEventError('STORE_FAILURE');
  }
  if (alreadyProcessed) return { outcome: 'DUPLICATE', suppressions: 0 };

  try {
    for (const suppression of toSuppress) await deps.store.recordSuppression(suppression);
    const marked = await deps.store.markEventProcessed(eventId);
    if (!marked) return { outcome: 'DUPLICATE', suppressions: 0 };
  } catch {
    throw new SesEventError('STORE_FAILURE');
  }
  return { outcome: ignored ? 'IGNORED' : 'PROCESSED', suppressions: toSuppress.length };
}
