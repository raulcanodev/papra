import type { Database } from '../app/database/database.types';
import type { Context } from '../app/server.types';
import type { FeatureFlagId } from './feature-flags.config';
import { createMiddleware } from 'hono/factory';
import { getUser } from '../app/auth/auth.models';
import { createError } from '../shared/errors/errors';
import { createUsersRepository } from '../users/users.repository';
import { hasFeatureAccess } from './feature-flags.models';

export function requireFeatureFlag({ flagId, db }: { flagId: FeatureFlagId; db: Database }) {
  return createMiddleware(async (context: Context, next) => {
    const { userId } = getUser({ context });
    const usersRepository = createUsersRepository({ db });
    const { user } = await usersRepository.getUserByIdOrThrow({ userId });

    if (!hasFeatureAccess({ flagId, userEmail: user.email })) {
      throw createError({
        message: 'You do not have access to this feature',
        code: 'feature_flags.access_denied',
        statusCode: 403,
      });
    }

    await next();
  });
}
