import type { RouteDefinitionContext } from '../app/server.types';
import { requireAuthentication } from '../app/auth/auth.middleware';
import { getUser } from '../app/auth/auth.models';
import { createUsersRepository } from '../users/users.repository';
import { getUserFeatureFlags } from './feature-flags.models';

export function registerFeatureFlagsRoutes({ app, db }: RouteDefinitionContext) {
  app.get(
    '/api/feature-flags',
    requireAuthentication(),
    async (context) => {
      const { userId } = getUser({ context });
      const usersRepository = createUsersRepository({ db });
      const { user } = await usersRepository.getUserByIdOrThrow({ userId });

      const flags = getUserFeatureFlags({ userEmail: user.email });

      return context.json({ featureFlags: flags });
    },
  );
}
