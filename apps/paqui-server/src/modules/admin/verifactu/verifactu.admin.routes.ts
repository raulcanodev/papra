import type { RouteDefinitionContext } from '../../app/server.types';
import { z } from 'zod';
import { createRoleMiddleware, requireAuthentication } from '../../app/auth/auth.middleware';
import { verifactuConfigurationSchema, verifactuSystemStateSchema } from '../../invoicing/invoicing.schemas';
import { createVerifactuRepository } from '../../invoicing/verifactu.repository';
import { organizationIdSchema } from '../../organizations/organization.schemas.legacy';
import { PERMISSIONS } from '../../roles/roles.constants';
import { legacyValidateJsonBody, legacyValidateParams } from '../../shared/validation/validation.legacy';

export function registerAdminVerifactuRoutes({ app, db }: RouteDefinitionContext) {
  const { requirePermissions } = createRoleMiddleware({ db });
  const authorize = requirePermissions({ requiredPermissions: [PERMISSIONS.VIEW_USERS] });
  const organizationParams = z.object({ organizationId: organizationIdSchema });
  const repository = createVerifactuRepository({ db });

  app.get('/api/admin/verifactu/dashboard', requireAuthentication(), authorize, async context => context.json(await repository.getDashboard()));

  app.put('/api/admin/verifactu/system-state', requireAuthentication(), authorize, legacyValidateJsonBody(verifactuSystemStateSchema), async (context) => {
    return context.json(await repository.updateSystemState({ state: context.req.valid('json') }));
  });

  app.get('/api/admin/organizations/:organizationId/verifactu', requireAuthentication(), authorize, legacyValidateParams(organizationParams), async (context) => {
    return context.json(await repository.getConfiguration({ organizationId: context.req.valid('param').organizationId }));
  });

  app.put('/api/admin/organizations/:organizationId/verifactu', requireAuthentication(), authorize, legacyValidateParams(organizationParams), legacyValidateJsonBody(verifactuConfigurationSchema), async (context) => {
    return context.json(await repository.upsertConfiguration({ organizationId: context.req.valid('param').organizationId, configuration: context.req.valid('json') }));
  });
}
