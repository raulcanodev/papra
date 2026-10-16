import type { RouteDefinitionContext } from '../app/server.types';
import { z } from 'zod';
import { requireAuthentication } from '../app/auth/auth.middleware';
import { getUser } from '../app/auth/auth.models';
import { getPermissionsForRoles } from '../roles/roles.methods';
import { createRolesRepository } from '../roles/roles.repository';
import { pick } from '../shared/objects';
import { legacyValidateJsonBody } from '../shared/validation/validation.legacy';
import { createUsersRepository } from './users.repository';

export function registerUsersRoutes(context: RouteDefinitionContext) {
  setupGetCurrentUserRoute(context);
  setupUpdateUserRoute(context);
}

function setupGetCurrentUserRoute({ app, db }: RouteDefinitionContext) {
  app.get(
    '/api/users/me',
    requireAuthentication(),
    async (context) => {
      const { userId } = getUser({ context });

      const usersRepository = createUsersRepository({ db });
      const rolesRepository = createRolesRepository({ db });

      const [
        { user },
        { roles },
      ] = await Promise.all([
        usersRepository.getUserByIdOrThrow({ userId }),
        rolesRepository.getUserRoles({ userId }),
      ]);

      const { permissions } = getPermissionsForRoles({ roles });

      return context.json({
        user: {
          ...pick(
            user,
            [
              'id',
              'email',
              'name',
              'phone',
              'createdAt',
              'updatedAt',
              'twoFactorEnabled',
            ],
          ),

          permissions,
        },
      });
    },
  );
}

function setupUpdateUserRoute({ app, db }: RouteDefinitionContext) {
  app.put(
    '/api/users/me',
    requireAuthentication(),
    legacyValidateJsonBody(z.object({
      name: z.string().min(1).max(50),
      phone: z.string().trim().max(30).nullable().optional(),
    })),
    async (context) => {
      const { userId } = getUser({ context });

      const { name, phone } = context.req.valid('json');

      const usersRepository = createUsersRepository({ db });

      const { user } = await usersRepository.updateUser({ userId, name, phone: phone === undefined ? undefined : (phone === null || phone === '' ? null : phone) });

      return context.json({ user });
    },
  );
}
