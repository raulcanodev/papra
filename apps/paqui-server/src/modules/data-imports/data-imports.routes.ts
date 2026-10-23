import type { RouteDefinitionContext } from '../app/server.types';
import { z } from 'zod';
import { requireAuthentication } from '../app/auth/auth.middleware';
import { getUser } from '../app/auth/auth.models';
import { organizationIdSchema } from '../organizations/organization.schemas.legacy';
import { createOrganizationsRepository } from '../organizations/organizations.repository';
import { ensureUserIsInOrganization } from '../organizations/organizations.usecases';
import { legacyValidateJsonBody, legacyValidateParams } from '../shared/validation/validation.legacy';
import { analyzeDataImportSchema, confirmContactsImportSchema, confirmProductsImportSchema } from './data-imports.schemas';
import { analyzeDataImport, confirmContactsImport, confirmProductsImport } from './data-imports.usecases';

const basePath = '/api/organizations/:organizationId/data-imports';
const paramsSchema = z.object({ organizationId: organizationIdSchema });

// Moving from another software: its export of contacts or products is uploaded first as a document of the organization
// (the assistant attachments endpoint), read here, reviewed by the user, then saved at once
export function registerDataImportsRoutes({ app, db, config, documentsStorageService }: RouteDefinitionContext) {
  app.post(`${basePath}/analyze`, requireAuthentication(), legacyValidateParams(paramsSchema), legacyValidateJsonBody(analyzeDataImportSchema), async (context) => {
    const { userId } = getUser({ context });
    const { organizationId } = context.req.valid('param');
    await ensureUserIsInOrganization({ userId, organizationId, organizationsRepository: createOrganizationsRepository({ db }) });

    const { documentId, entity, sheetName } = context.req.valid('json');
    return context.json(await analyzeDataImport({ db, config, documentsStorageService, organizationId, documentId, entity, sheetName }));
  });

  app.post(`${basePath}/contacts/confirm`, requireAuthentication({ apiKeyPermissions: ['contacts:create', 'contacts:update'] }), legacyValidateParams(paramsSchema), legacyValidateJsonBody(confirmContactsImportSchema), async (context) => {
    const { userId } = getUser({ context });
    const { organizationId } = context.req.valid('param');
    await ensureUserIsInOrganization({ userId, organizationId, organizationsRepository: createOrganizationsRepository({ db }) });

    return context.json(await confirmContactsImport({ db, organizationId, input: context.req.valid('json') }));
  });

  app.post(`${basePath}/products/confirm`, requireAuthentication({ apiKeyPermissions: ['products:create', 'products:update'] }), legacyValidateParams(paramsSchema), legacyValidateJsonBody(confirmProductsImportSchema), async (context) => {
    const { userId } = getUser({ context });
    const { organizationId } = context.req.valid('param');
    await ensureUserIsInOrganization({ userId, organizationId, organizationsRepository: createOrganizationsRepository({ db }) });

    return context.json(await confirmProductsImport({ db, organizationId, input: context.req.valid('json') }));
  });
}
