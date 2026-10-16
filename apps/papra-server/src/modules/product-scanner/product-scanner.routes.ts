import type { RouteDefinitionContext } from '../app/server.types';
import { z } from 'zod';
import { requireAuthentication } from '../app/auth/auth.middleware';
import { getUser } from '../app/auth/auth.models';
import { contactIdSchema } from '../contacts/contacts.schemas';
import { organizationIdSchema } from '../organizations/organization.schemas.legacy';
import { createOrganizationsRepository } from '../organizations/organizations.repository';
import { ensureUserIsInOrganization } from '../organizations/organizations.usecases';
import { legacyValidateJsonBody, legacyValidateParams } from '../shared/validation/validation.legacy';
import { MAX_SCANNED_FILES } from './product-scanner.constants';
import { productCatalogImportSchema } from './product-scanner.models';
import { importProductCatalog, scanProductCatalog } from './product-scanner.usecases';

const paramsSchema = z.object({ organizationId: organizationIdSchema, contactId: contactIdSchema });

export function registerProductScannerRoutes(context: RouteDefinitionContext) {
  setupScanProductCatalogRoute(context);
  setupImportProductCatalogRoute(context);
}

// The files are uploaded first as documents of the organization (the assistant attachments endpoint), then read here
function setupScanProductCatalogRoute({ app, db, config, documentsStorageService }: RouteDefinitionContext) {
  app.post(
    '/api/organizations/:organizationId/contacts/:contactId/product-catalog/scan',
    requireAuthentication({ apiKeyPermissions: ['products:create'] }),
    legacyValidateParams(paramsSchema),
    legacyValidateJsonBody(z.object({ documentIds: z.array(z.string().trim().min(1).max(64)).min(1).max(MAX_SCANNED_FILES) })),
    async (context) => {
      const { userId } = getUser({ context });
      const { organizationId, contactId } = context.req.valid('param');
      const { documentIds } = context.req.valid('json');

      await ensureUserIsInOrganization({ userId, organizationId, organizationsRepository: createOrganizationsRepository({ db }) });

      const proposal = await scanProductCatalog({ db, config, documentsStorageService, organizationId, contactId, documentIds });

      return context.json(proposal);
    },
  );
}

function setupImportProductCatalogRoute({ app, db, config }: RouteDefinitionContext) {
  app.post(
    '/api/organizations/:organizationId/contacts/:contactId/product-catalog/import',
    requireAuthentication({ apiKeyPermissions: ['products:create'] }),
    legacyValidateParams(paramsSchema),
    legacyValidateJsonBody(productCatalogImportSchema),
    async (context) => {
      const { userId } = getUser({ context });
      const { organizationId, contactId } = context.req.valid('param');

      await ensureUserIsInOrganization({ userId, organizationId, organizationsRepository: createOrganizationsRepository({ db }) });

      const result = await importProductCatalog({ db, config, organizationId, contactId, input: context.req.valid('json') });

      return context.json(result);
    },
  );
}
