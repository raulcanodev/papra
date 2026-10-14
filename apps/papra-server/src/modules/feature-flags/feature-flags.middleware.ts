import type { Database } from '../app/database/database.types';
import type { Context } from '../app/server.types';
import { createMiddleware } from 'hono/factory';
import { getUser } from '../app/auth/auth.models';
import { createError } from '../shared/errors/errors';
import { userHasFeatureFlag } from './feature-flags.usecases';

export function requireFeatureFlag({ flagId, db }: { flagId: string; db: Database }) {
  return createMiddleware(async (context: Context, next) => {
    const { userId } = getUser({ context });
    const hasAccess = await userHasFeatureFlag({ userId, flagId, db });

    if (!hasAccess) {
      throw createError({
        message: 'You do not have access to this feature',
        code: 'feature_flags.access_denied',
        statusCode: 403,
      });
    }

    await next();
  });
}
