import type { RouteDefinitionContext } from '../../app/server.types';
import { z } from 'zod';
import { createRoleMiddleware, requireAuthentication } from '../../app/auth/auth.middleware';
import { PERMISSIONS } from '../../roles/roles.constants';
import { legacyValidateJsonBody, legacyValidateParams } from '../../shared/validation/validation.legacy';
import { createFeatureFlagsRepository } from '../feature-flags.repository';

export function registerAdminFeatureFlagsRoutes(context: RouteDefinitionContext) {
  registerListFeatureFlagEntriesRoute(context);
  registerAddFeatureFlagEntryRoute(context);
  registerRemoveFeatureFlagEntryRoute(context);
}

function registerListFeatureFlagEntriesRoute({ app, db }: RouteDefinitionContext) {
  const { requirePermissions } = createRoleMiddleware({ db });

  app.get(
    '/api/admin/feature-flags',
    requireAuthentication(),
    requirePermissions({ requiredPermissions: [PERMISSIONS.BO_ACCESS] }),
    async (context) => {
      const repository = createFeatureFlagsRepository({ db });
      const entries = await repository.listAllEntries();
      return context.json({ entries });
    },
  );
}

function registerAddFeatureFlagEntryRoute({ app, db }: RouteDefinitionContext) {
  const { requirePermissions } = createRoleMiddleware({ db });

  app.post(
    '/api/admin/feature-flags',
    requireAuthentication(),
    requirePermissions({ requiredPermissions: [PERMISSIONS.BO_ACCESS] }),
    legacyValidateJsonBody(
      z.object({
        flagId: z.string().min(1).max(100),
        userEmail: z.string().email(),
      }),
    ),
    async (context) => {
      const { flagId, userEmail } = context.req.valid('json');
      const repository = createFeatureFlagsRepository({ db });
      await repository.addEntry({ flagId, userEmail });
      return context.json({ success: true }, 201);
    },
  );
}

function registerRemoveFeatureFlagEntryRoute({ app, db }: RouteDefinitionContext) {
  const { requirePermissions } = createRoleMiddleware({ db });

  app.delete(
    '/api/admin/feature-flags/:entryId',
    requireAuthentication(),
    requirePermissions({ requiredPermissions: [PERMISSIONS.BO_ACCESS] }),
    legacyValidateParams(
      z.object({
        entryId: z.string().min(1),
      }),
    ),
    async (context) => {
      const { entryId } = context.req.valid('param');
      const repository = createFeatureFlagsRepository({ db });
      await repository.removeEntry({ entryId });
      return context.json({ success: true });
    },
  );
}
