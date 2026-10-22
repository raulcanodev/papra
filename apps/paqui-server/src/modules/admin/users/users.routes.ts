import type { RouteDefinitionContext } from '../../app/server.types';
import { z } from 'zod';
import { createRoleMiddleware, requireAuthentication } from '../../app/auth/auth.middleware';
import { getUser } from '../../app/auth/auth.models';
import { createOrganizationsRepository } from '../../organizations/organizations.repository';
import { PERMISSIONS } from '../../roles/roles.constants';
import { createRolesRepository } from '../../roles/roles.repository';
import { legacyValidateParams, legacyValidateQuery } from '../../shared/validation/validation.legacy';
import { createUsersRepository } from '../../users/users.repository';
import { userIdSchema } from '../../users/users.schemas.legacy';
import { getImpersonationTargetError } from '../impersonation/impersonation.models';
import { createImpersonationsRepository } from '../impersonation/impersonation.repository';

export function registerUserManagementRoutes(context: RouteDefinitionContext) {
  registerListUsersRoute(context);
  registerGetUserDetailRoute(context);
}

function registerListUsersRoute({ app, db }: RouteDefinitionContext) {
  const { requirePermissions } = createRoleMiddleware({ db });

  app.get(
    '/api/admin/users',
    requireAuthentication(),
    requirePermissions({
      requiredPermissions: [PERMISSIONS.VIEW_USERS],
    }),
    legacyValidateQuery(
      z.object({
        search: z.string().optional(),
        pageIndex: z.coerce.number().min(0).int().optional().default(0),
        pageSize: z.coerce.number().min(1).max(100).int().optional().default(25),
      }),
    ),
    async (context) => {
      const usersRepository = createUsersRepository({ db });

      const { search, pageIndex, pageSize } = context.req.valid('query');

      const { users, totalCount } = await usersRepository.listUsers({
        search,
        pageIndex,
        pageSize,
      });

      return context.json({
        users,
        totalCount,
        pageIndex,
        pageSize,
      });
    },
  );
}

function registerGetUserDetailRoute({ app, db }: RouteDefinitionContext) {
  const { requirePermissions } = createRoleMiddleware({ db });

  app.get(
    '/api/admin/users/:userId',
    requireAuthentication(),
    requirePermissions({
      requiredPermissions: [PERMISSIONS.VIEW_USERS],
    }),
    legacyValidateParams(z.object({
      userId: userIdSchema,
    })),
    async (context) => {
      const usersRepository = createUsersRepository({ db });
      const organizationsRepository = createOrganizationsRepository({ db });
      const rolesRepository = createRolesRepository({ db });
      const impersonationsRepository = createImpersonationsRepository({ db });

      const { userId } = context.req.valid('param');
      const { userId: adminUserId } = getUser({ context });

      const { user } = await usersRepository.getUserByIdOrThrow({ userId });
      const { organizations } = await organizationsRepository.getUserOrganizations({ userId });
      const { roles } = await rolesRepository.getUserRoles({ userId });
      const { impersonations } = await impersonationsRepository.listUserImpersonations({ userId });

      return context.json({
        user,
        organizations,
        roles,
        impersonations,
        // Whether this user can be impersonated at all; the admin's own permission is checked when starting
        isImpersonable: getImpersonationTargetError({ adminUserId, targetUserId: userId, targetRoles: roles }) === undefined,
      });
    },
  );
}
