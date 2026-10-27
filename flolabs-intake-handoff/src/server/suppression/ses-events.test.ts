import { describe, expect, it } from 'vitest';
import { createTestSuppressionStore } from './test-store';
import { processSesSnsRecord, SesEventError } from './ses-events';

const TOPIC = 'arn:aws:sns:us-east-1:123456789012:ses-feedback';

function record(event: unknown, id = 'event-1', topic = TOPIC) {
  return {
    EventSource: 'aws:sns',
    Sns: { Type: 'Notification', TopicArn: topic, MessageId: id, Message: JSON.stringify(event) },
  };
}

const mail = { messageId: 'ses-message-1', destination: ['person@example.com'] };

describe('SES SNS event handler', () => {
  it('records delivery as processed without creating suppression', async () => {
    const store = createTestSuppressionStore();
    const result = await processSesSnsRecord(record({ eventType: 'Delivery', mail, delivery: { recipients: mail.destination } }), { store, expectedTopicArn: TOPIC });
    expect(result).toEqual({ outcome: 'PROCESSED', suppressions: 0 });
    expect(store.entries).toEqual([]);
  });

  it('suppresses permanent bounces, normalized and scoped to all marketing', async () => {
    const store = createTestSuppressionStore();
    const result = await processSesSnsRecord(
      record({ eventType: 'Bounce', mail, bounce: { bounceType: 'Permanent', bouncedRecipients: [{ emailAddress: 'Person+one@Example.com' }] } }),
      { store, expectedTopicArn: TOPIC },
    );
    expect(result).toEqual({ outcome: 'PROCESSED', suppressions: 1 });
    expect(store.entries[0]).toMatchObject({
      normalizedEmail: 'person+one@example.com',
      reason: 'HARD_BOUNCE',
      scope: 'ALL_MARKETING',
    });
  });

  it.each(['Transient', 'Undetermined'])('does not suppress %s bounces', async (bounceType) => {
    const store = createTestSuppressionStore();
    const result = await processSesSnsRecord(
      record({ eventType: 'Bounce', mail, bounce: { bounceType, bouncedRecipients: [{ emailAddress: 'person@example.com' }] } }),
      { store, expectedTopicArn: TOPIC },
    );
    expect(result).toEqual({ outcome: 'IGNORED', suppressions: 0 });
    expect(store.entries).toEqual([]);
  });

  it('suppresses complaint recipients without logging addresses', async () => {
    const store = createTestSuppressionStore();
    const result = await processSesSnsRecord(
      record({ eventType: 'Complaint', mail, complaint: { complainedRecipients: [{ emailAddress: 'Person@Example.com' }] } }),
      { store, expectedTopicArn: TOPIC },
    );
    expect(result.suppressions).toBe(1);
    expect(store.entries[0]).toMatchObject({ reason: 'COMPLAINT', normalizedEmail: 'person@example.com' });
    expect(JSON.stringify(result)).not.toContain('example.com');
  });

  it('handles rejection as an event outcome but does not suppress recipients', async () => {
    const store = createTestSuppressionStore();
    const result = await processSesSnsRecord(record({ eventType: 'Reject', mail, reject: { reason: 'Bad content' } }), { store, expectedTopicArn: TOPIC });
    expect(result).toEqual({ outcome: 'PROCESSED', suppressions: 0 });
    expect(store.entries).toEqual([]);
  });

  it('uses both the processed-event marker and unique suppression for duplicate notifications', async () => {
    const store = createTestSuppressionStore();
    const event = record({ eventType: 'Bounce', mail, bounce: { bounceType: 'Permanent', bouncedRecipients: [{ emailAddress: 'person@example.com' }] } });
    await processSesSnsRecord(event, { store, expectedTopicArn: TOPIC });
    const duplicate = await processSesSnsRecord(event, { store, expectedTopicArn: TOPIC });
    expect(duplicate).toEqual({ outcome: 'DUPLICATE', suppressions: 0 });
    expect(store.entries).toHaveLength(1);
  });

  it('marks unknown event types ignored without suppressing', async () => {
    const store = createTestSuppressionStore();
    const result = await processSesSnsRecord(record({ eventType: 'Open', mail }), { store, expectedTopicArn: TOPIC });
    expect(result).toEqual({ outcome: 'IGNORED', suppressions: 0 });
    expect(store.events.size).toBe(1);
  });

  it('validates a payload before accepting a duplicate event id', async () => {
    const store = createTestSuppressionStore();
    const malformed = record({ eventType: 'Bounce', mail, bounce: { bounceType: 'Permanent', bouncedRecipients: [] } });
    await expect(processSesSnsRecord(malformed, { store, expectedTopicArn: TOPIC })).rejects.toMatchObject({
      code: 'INVALID_PAYLOAD',
    });

    const valid = record(
      { eventType: 'Bounce', mail, bounce: { bounceType: 'Permanent', bouncedRecipients: [{ emailAddress: 'person@example.com' }] } },
    );
    expect(await processSesSnsRecord(valid, { store, expectedTopicArn: TOPIC })).toEqual({
      outcome: 'PROCESSED',
      suppressions: 1,
    });
  });

  it('validates all suppression recipients before writing any of them', async () => {
    const store = createTestSuppressionStore();
    const malformed = record({
      eventType: 'Bounce',
      mail,
      bounce: {
        bounceType: 'Permanent',
        bouncedRecipients: [{ emailAddress: 'first@example.com' }, { emailAddress: 'invalid address' }],
      },
    });
    await expect(processSesSnsRecord(malformed, { store, expectedTopicArn: TOPIC })).rejects.toMatchObject({
      code: 'INVALID_PAYLOAD',
    });
    expect(store.entries).toEqual([]);
  });

  it('allows a failed event-marker write to be retried without duplicate suppression records', async () => {
    const store = createTestSuppressionStore();
    const markProcessed = store.markEventProcessed.bind(store);
    store.markEventProcessed = async () => {
      throw new Error('temporary storage failure');
    };
    const event = record({
      eventType: 'Bounce',
      mail,
      bounce: { bounceType: 'Permanent', bouncedRecipients: [{ emailAddress: 'person@example.com' }] },
    });
    await expect(processSesSnsRecord(event, { store, expectedTopicArn: TOPIC })).rejects.toMatchObject({
      code: 'STORE_FAILURE',
    });
    store.markEventProcessed = markProcessed;
    expect(await processSesSnsRecord(event, { store, expectedTopicArn: TOPIC })).toEqual({
      outcome: 'PROCESSED',
      suppressions: 1,
    });
    expect(store.entries).toHaveLength(1);
  });

  it.each([
    ['malformed SNS envelope', { Sns: {} }, 'INVALID_ENVELOPE'],
    ['untrusted SNS topic', record({ eventType: 'Delivery', mail, delivery: { recipients: mail.destination } }, 'x', 'arn:wrong'), 'WRONG_TOPIC'],
    ['malformed SES JSON', { EventSource: 'aws:sns', Sns: { Type: 'Notification', TopicArn: TOPIC, MessageId: 'x', Message: '{bad' } }, 'INVALID_PAYLOAD'],
    ['missing bounce recipients', record({ eventType: 'Bounce', mail, bounce: { bounceType: 'Permanent', bouncedRecipients: [] } }), 'INVALID_PAYLOAD'],
    ['invalid recipient address', record({ eventType: 'Complaint', mail, complaint: { complainedRecipients: [{ emailAddress: 'not-email' }] } }), 'INVALID_PAYLOAD'],
  ])('rejects %s without acknowledging the event', async (_name, value, code) => {
    await expect(processSesSnsRecord(value, { store: createTestSuppressionStore(), expectedTopicArn: TOPIC })).rejects.toMatchObject({
      code: code as SesEventError['code'],
    } satisfies Partial<SesEventError>);
  });
});
