import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient, GetCommand, PutCommand, QueryCommand, UpdateCommand } from '@aws-sdk/lib-dynamodb';
import { createDynamoSuppressionStore } from '../../../src/server/suppression/dynamo-store';
import { processSesSnsRecord, SesEventError, type SesEventResult } from '../../../src/server/suppression/ses-events';
import type { SuppressionDynamoClient } from '../../../src/server/suppression/types';

type LambdaEvent = { Records?: unknown[] };

let store: ReturnType<typeof createDynamoSuppressionStore> | undefined;

function getStore() {
  if (!store) {
    const tableName = process.env.SUPPRESSION_TABLE_NAME;
    const region = process.env.AWS_REGION;
    if (!tableName || !region) throw new SesEventError('STORE_FAILURE');
    const client = DynamoDBDocumentClient.from(new DynamoDBClient({ region }));
    const adapter: SuppressionDynamoClient = {
      get: async (input) => client.send(new GetCommand(input)),
      query: async (input) => client.send(new QueryCommand(input)),
      update: async (input) => client.send(new UpdateCommand(input)),
      put: async (input) => client.send(new PutCommand(input)),
    };
    store = createDynamoSuppressionStore(adapter, { tableName });
  }
  return store;
}

export async function handler(event: LambdaEvent) {
  const topicArn = process.env.EXPECTED_SNS_TOPIC_ARN;
  if (!topicArn || !Array.isArray(event.Records)) throw new SesEventError('INVALID_ENVELOPE');

  const results: SesEventResult[] = [];
  for (const record of event.Records) {
    try {
      results.push(await processSesSnsRecord(record, { store: getStore(), expectedTopicArn: topicArn }));
    } catch (error) {
      const code = error instanceof SesEventError ? error.code : 'STORE_FAILURE';
      console.error(JSON.stringify({ event: 'ses.feedback.failed', code }));
      throw new SesEventError(code);
    }
  }

  for (const result of results) {
    console.info(JSON.stringify({ event: 'ses.feedback.processed', outcome: result.outcome, suppressions: result.suppressions }));
  }
  return { processed: results.length };
}
