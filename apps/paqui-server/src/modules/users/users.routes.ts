import type { RouteDefinitionContext } from '../app/server.types';
import { z } from 'zod';
import { forbidDuringImpersonation, requireAuthentication } from '../app/auth/auth.middleware';
import { getUser } from '../app/auth/auth.models';
import { getPermissionsForRoles } from '../roles/roles.methods';
import { createRolesRepository } from '../roles/roles.repository';
import { pick } from '../shared/objects';
import { legacyValidateJsonBody } from '../shared/validation/validation.legacy';
import { createUsersRepository } from './users.repository';

export function registerUsersRoutes(context: RouteDefinitionContext) {
  setupGetCurrentUserRoute(context);
  setupUpdateUserRoute(context);
  setupChangelogSeenRoute(context);
  setupSetPasswordRoute(context);
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
              'lastSeenChangelogId',
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

// An admin acting as the user must not use up the news meant for them
function setupChangelogSeenRoute({ app, db }: RouteDefinitionContext) {
  app.put(
    '/api/users/me/changelog-seen',
    requireAuthentication(),
    forbidDuringImpersonation(),
    legacyValidateJsonBody(z.object({
      entryId: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
    })),
    async (context) => {
      const { userId } = getUser({ context });

      await createUsersRepository({ db }).setLastSeenChangelog({ userId, entryId: context.req.valid('json').entryId });

      return context.body(null, 204);
    },
  );
}

// Accounts created through an OAuth provider have no password, better-auth only lets the
// server set the first one
function setupSetPasswordRoute({ app, auth }: RouteDefinitionContext) {
  app.post(
    '/api/users/me/password',
    requireAuthentication(),
    forbidDuringImpersonation(),
    legacyValidateJsonBody(z.object({
      newPassword: z.string().min(8).max(128),
    })),
    async (context) => {
      const { newPassword } = context.req.valid('json');

      return auth.api.setPassword({
        body: { newPassword },
        headers: context.req.raw.headers,
        asResponse: true,
      });
    },
  );
}
