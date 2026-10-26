import type { GetCommandInput, PutCommandInput, QueryCommandInput, UpdateCommandInput } from '@aws-sdk/lib-dynamodb';

export type SuppressionReason = 'HARD_BOUNCE' | 'COMPLAINT' | 'UNSUBSCRIBED';
export type SuppressionScope = 'ALL_MARKETING' | 'TOPIC';

export type SuppressionRecord = {
  email: string;
  normalizedEmail: string;
  reason: SuppressionReason;
  scope: SuppressionScope;
  topic?: string;
  eventId: string;
  source: 'SES_EVENT' | 'UNSUBSCRIBE';
  occurredAt?: string;
};

export interface SuppressionStore {
  isSuppressed(email: string, topic?: string): Promise<boolean>;
  recordSuppression(record: SuppressionRecord): Promise<void>;
  isEventProcessed(eventId: string): Promise<boolean>;
  markEventProcessed(eventId: string): Promise<boolean>;
}

export type SuppressionStoreOptions = {
  tableName: string;
  now?: () => Date;
};

export interface SuppressionDynamoClient {
  get(input: GetCommandInput): Promise<{ Item?: Record<string, unknown> }>;
  query(input: QueryCommandInput): Promise<{ Items?: Record<string, unknown>[] }>;
  update(input: UpdateCommandInput): Promise<unknown>;
  put(input: PutCommandInput): Promise<unknown>;
}
