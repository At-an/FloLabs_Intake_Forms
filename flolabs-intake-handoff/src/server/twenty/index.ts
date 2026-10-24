import 'server-only';
import { getEnv } from '../env';
import { createTwentyClient, type TwentyClient } from './client';

export { TwentyError, type TwentyClient } from './client';
export type * from './types';

let client: TwentyClient | undefined;

export function getTwentyClient(): TwentyClient {
  if (!client) {
    const env = getEnv();
    client = createTwentyClient({ baseUrl: env.TWENTY_BASE_URL, apiKey: env.TWENTY_API_KEY });
  }
  return client;
}
