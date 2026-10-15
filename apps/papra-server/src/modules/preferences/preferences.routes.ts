import type { RouteDefinitionContext } from '../app/server.types';
import { z } from 'zod';
import { requireAuthentication } from '../app/auth/auth.middleware';
import { getUser } from '../app/auth/auth.models';
import { organizationIdSchema } from '../organizations/organization.schemas.legacy';
import { createOrganizationsRepository } from '../organizations/organizations.repository';
import { ensureUserIsInOrganization } from '../organizations/organizations.usecases';
import { legacyValidateJsonBody, legacyValidateParams } from '../shared/validation/validation.legacy';
import { memberPreferencesPatchSchema } from './preferences.models';
import { createPreferencesRepository } from './preferences.repository';

const paramsSchema = z.object({ organizationId: organizationIdSchema });

export function registerPreferencesRoutes(context: RouteDefinitionContext) {
  setupGetPreferencesRoute(context);
  setupUpdatePreferencesRoute(context);
}

function setupGetPreferencesRoute({ app, db }: RouteDefinitionContext) {
  app.get(
    '/api/organizations/:organizationId/preferences',
    requireAuthentication(),
    legacyValidateParams(paramsSchema),
    async (context) => {
      const { userId } = getUser({ context });
      const { organizationId } = context.req.valid('param');

      await ensureUserIsInOrganization({ userId, organizationId, organizationsRepository: createOrganizationsRepository({ db }) });

      const { preferences } = await createPreferencesRepository({ db }).getMemberPreferences({ organizationId, userId });

      return context.json({ preferences });
    },
  );
}

function setupUpdatePreferencesRoute({ app, db }: RouteDefinitionContext) {
  app.patch(
    '/api/organizations/:organizationId/preferences',
    requireAuthentication(),
    legacyValidateParams(paramsSchema),
    legacyValidateJsonBody(memberPreferencesPatchSchema),
    async (context) => {
      const { userId } = getUser({ context });
      const { organizationId } = context.req.valid('param');
      const patch = context.req.valid('json');

      await ensureUserIsInOrganization({ userId, organizationId, organizationsRepository: createOrganizationsRepository({ db }) });

      const { preferences } = await createPreferencesRepository({ db }).updateMemberPreferences({ organizationId, userId, patch });

      return context.json({ preferences });
    },
  );
}
