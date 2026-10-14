import type { RouteDefinitionContext } from '../app/server.types';
import { z } from 'zod';
import { requireAuthentication } from '../app/auth/auth.middleware';
import { getUser } from '../app/auth/auth.models';
import { organizationIdSchema } from '../organizations/organization.schemas.legacy';
import { createOrganizationsRepository } from '../organizations/organizations.repository';
import { ensureUserIsInOrganization } from '../organizations/organizations.usecases';
import { legacyValidateParams, legacyValidateQuery } from '../shared/validation/validation.legacy';
import { filterKindsByPermissions, parseSearchKinds } from './search.models';
import { createSearchRepository } from './search.repository';
import { searchWorkspace } from './search.usecases';

const searchQuerySchema = z.object({
  query: z.string().trim().min(2).max(200),
  kinds: z.string().optional(),
  limitPerKind: z.coerce.number().int().min(1).max(25).default(8),
});

export function registerSearchRoutes({ app, db, documentSearchServices }: RouteDefinitionContext) {
  app.get(
    '/api/organizations/:organizationId/search',
    requireAuthentication({ apiKeyPermissions: ['organizations:read'] }),
    legacyValidateParams(z.object({ organizationId: organizationIdSchema })),
    legacyValidateQuery(searchQuerySchema),
    async (context) => {
      const { userId } = getUser({ context });
      const { organizationId } = context.req.valid('param');
      const { query, kinds, limitPerKind } = context.req.valid('query');

      await ensureUserIsInOrganization({ userId, organizationId, organizationsRepository: createOrganizationsRepository({ db }) });

      const apiKey = context.get('apiKey');

      const result = await searchWorkspace({
        organizationId,
        query,
        limitPerKind,
        kinds: filterKindsByPermissions({ kinds: parseSearchKinds({ kinds }), apiKeyPermissions: apiKey?.permissions }),
        searchRepository: createSearchRepository({ db }),
        documentSearchServices,
      });

      return context.json(result);
    },
  );
}
