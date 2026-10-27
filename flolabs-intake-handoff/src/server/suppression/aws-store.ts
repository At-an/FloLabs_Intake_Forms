import 'server-only';
import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient, GetCommand, PutCommand, QueryCommand, UpdateCommand } from '@aws-sdk/lib-dynamodb';
import { createDynamoSuppressionStore } from './dynamo-store';

let store: ReturnType<typeof createDynamoSuppressionStore> | undefined;

export function getSuppressionStore() {
  if (!store) {
    const tableName = process.env.SUPPRESSION_TABLE_NAME;
    const region = process.env.AWS_REGION;
    if (!tableName || !region) throw new Error('SUPPRESSION_STORE_NOT_CONFIGURED');

    const client = DynamoDBDocumentClient.from(new DynamoDBClient({ region }));
    store = createDynamoSuppressionStore(
      {
        get: (input) => client.send(new GetCommand(input)),
        query: (input) => client.send(new QueryCommand(input)),
        update: (input) => client.send(new UpdateCommand(input)),
        put: (input) => client.send(new PutCommand(input)),
      },
      { tableName },
    );
  }
  return store;
}
