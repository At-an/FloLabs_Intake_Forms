import type { SuppressionRecord, SuppressionStore } from './types';

export function createTestSuppressionStore(): SuppressionStore & { entries: SuppressionRecord[]; events: Set<string> } {
  const entries: SuppressionRecord[] = [];
  const events = new Set<string>();
  return {
    entries,
    events,
    async isSuppressed(email, topic) {
      return entries.some(
        (entry) =>
          entry.normalizedEmail === email.trim().toLowerCase() &&
          (entry.scope === 'ALL_MARKETING' || (entry.scope === 'TOPIC' && entry.topic === topic)),
      );
    },
    async recordSuppression(record) {
      if (!entries.some((entry) => entry.normalizedEmail === record.normalizedEmail && entry.reason === record.reason && entry.scope === record.scope && entry.topic === record.topic)) {
        entries.push(record);
      }
    },
    async isEventProcessed(eventId) {
      return events.has(eventId);
    },
    async markEventProcessed(eventId) {
      if (events.has(eventId)) return false;
      events.add(eventId);
      return true;
    },
  };
}
