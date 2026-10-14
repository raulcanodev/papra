import type { RouteDefinitionContext } from '../app/server.types';
import { z } from 'zod';
import { requireAuthentication } from '../app/auth/auth.middleware';
import { getUser } from '../app/auth/auth.models';
import { organizationIdSchema } from '../organizations/organization.schemas.legacy';
import { createOrganizationsRepository } from '../organizations/organizations.repository';
import { ensureUserIsInOrganization } from '../organizations/organizations.usecases';
import { legacyValidateParams, legacyValidateQuery } from '../shared/validation/validation.legacy';
import { createDashboardRepository } from './dashboard.repository';

export function registerDashboardRoutes(context: RouteDefinitionContext) {
  setupGetDashboardMetricsRoute(context);
}

function setupGetDashboardMetricsRoute({ app, db }: RouteDefinitionContext) {
  app.get(
    '/api/organizations/:organizationId/dashboard/metrics',
    requireAuthentication(),
    legacyValidateParams(z.object({ organizationId: organizationIdSchema })),
    legacyValidateQuery(z.object({ year: z.coerce.number().int().min(2000).max(2100).optional() })),
    async (context) => {
      const { userId } = getUser({ context });
      const { organizationId } = context.req.valid('param');
      const { year } = context.req.valid('query');

      await ensureUserIsInOrganization({ userId, organizationId, organizationsRepository: createOrganizationsRepository({ db }) });

      const { metrics } = await createDashboardRepository({ db }).getOrganizationMetrics({ organizationId, year });

      return context.json({ metrics });
    },
  );
}
