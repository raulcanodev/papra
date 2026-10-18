import type { Context } from '../app/server.types';
import { AsyncLocalStorage } from 'node:async_hooks';

// The request an AI call happens in, so its usage is attributed to the workspace and member without passing them
// through every function. Background jobs have no request: they pass the organization to getAiModel themselves.
const requestStorage = new AsyncLocalStorage<{ context: Context }>();

export function createAiUsageContextMiddleware() {
  return async (context: Context, next: () => Promise<void>) => requestStorage.run({ context }, next);
}

const ORGANIZATION_PATH_PATTERN = /^\/api\/organizations\/(org_[^/]+)/;

// Read at the start of each call: the user set by the authentication, the workspace of the route
export function getRequestAiUsageContext(): { organizationId: string | null; userId: string | null } {
  const store = requestStorage.getStore();

  if (!store) {
    return { organizationId: null, userId: null };
  }

  const userId = store.context.get('userId');
  const organizationId = ORGANIZATION_PATH_PATTERN.exec(new URL(store.context.req.url).pathname)?.[1] ?? null;

  return { organizationId, userId: typeof userId === 'string' ? userId : null };
}
