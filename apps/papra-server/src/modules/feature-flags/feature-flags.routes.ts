import type { RouteDefinitionContext } from '../app/server.types';
import { requireAuthentication } from '../app/auth/auth.middleware';
import { getUser } from '../app/auth/auth.models';
import { createUsersRepository } from '../users/users.repository';
import { createFeatureFlagsRepository } from './feature-flags.repository';

export function registerFeatureFlagsRoutes({ app, db }: RouteDefinitionContext) {
  app.get(
    '/api/feature-flags',
    requireAuthentication(),
    async (context) => {
      const { userId } = getUser({ context });
      const usersRepository = createUsersRepository({ db });
      const featureFlagsRepository = createFeatureFlagsRepository({ db });

      const { user } = await usersRepository.getUserByIdOrThrow({ userId });
      const flags = await featureFlagsRepository.getFeatureFlagsForUser({ userEmail: user.email });

      return context.json({ featureFlags: flags });
    },
  );
}
