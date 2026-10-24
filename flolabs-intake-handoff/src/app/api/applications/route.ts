import { createApplicationsHandler } from '@/server/applications/handler';
import { logger } from '@/server/logger';
import { getTwentyClient } from '@/server/twenty';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

let handle: ReturnType<typeof createApplicationsHandler> | undefined;

export async function POST(request: Request) {
  handle ??= createApplicationsHandler({ twenty: getTwentyClient(), logger });
  return handle(request);
}
