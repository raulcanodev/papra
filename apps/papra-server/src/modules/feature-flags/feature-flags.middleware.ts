import type { Database } from '../app/database/database.types';
import type { Context } from '../app/server.types';
import { createMiddleware } from 'hono/factory';
import { getUser } from '../app/auth/auth.models';
import { createError } from '../shared/errors/errors';
import { createUsersRepository } from '../users/users.repository';
import { createFeatureFlagsRepository } from './feature-flags.repository';

export function requireFeatureFlag({ flagId, db }: { flagId: string; db: Database }) {
  return createMiddleware(async (context: Context, next) => {
    const { userId } = getUser({ context });
    const usersRepository = createUsersRepository({ db });
    const featureFlagsRepository = createFeatureFlagsRepository({ db });

    const { user } = await usersRepository.getUserByIdOrThrow({ userId });
    const hasAccess = await featureFlagsRepository.hasFeatureFlag({ flagId, userEmail: user.email });

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
