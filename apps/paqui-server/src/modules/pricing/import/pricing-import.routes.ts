import type { RouteDefinitionContext } from '../../app/server.types';
import { z } from 'zod';
import { requireAuthentication } from '../../app/auth/auth.middleware';
import { getUser } from '../../app/auth/auth.models';
import { organizationIdSchema } from '../../organizations/organization.schemas.legacy';
import { createOrganizationsRepository } from '../../organizations/organizations.repository';
import { ensureUserIsInOrganization } from '../../organizations/organizations.usecases';
import { legacyValidateJsonBody, legacyValidateParams } from '../../shared/validation/validation.legacy';
import { analyzePricingImportSchema, confirmPricingImportSchema } from './pricing-import.schemas';
import { analyzePricingImport, confirmPricingImport } from './pricing-import.usecases';

const basePath = '/api/organizations/:organizationId/pricing/imports';
const paramsSchema = z.object({ organizationId: organizationIdSchema });

// The spreadsheet is uploaded first as a document of the organization (the assistant attachments endpoint), then read here
export function registerPricingImportRoutes({ app, db, config, documentsStorageService }: RouteDefinitionContext) {
  app.post(`${basePath}/analyze`, requireAuthentication({ apiKeyPermissions: ['products:create'] }), legacyValidateParams(paramsSchema), legacyValidateJsonBody(analyzePricingImportSchema), async (context) => {
    const { userId } = getUser({ context });
    const { organizationId } = context.req.valid('param');
    await ensureUserIsInOrganization({ userId, organizationId, organizationsRepository: createOrganizationsRepository({ db }) });

    return context.json(await analyzePricingImport({ db, config, documentsStorageService, organizationId, documentId: context.req.valid('json').documentId }));
  });

  app.post(`${basePath}/confirm`, requireAuthentication({ apiKeyPermissions: ['products:create', 'products:update'] }), legacyValidateParams(paramsSchema), legacyValidateJsonBody(confirmPricingImportSchema), async (context) => {
    const { userId } = getUser({ context });
    const { organizationId } = context.req.valid('param');
    await ensureUserIsInOrganization({ userId, organizationId, organizationsRepository: createOrganizationsRepository({ db }) });

    return context.json(await confirmPricingImport({ db, organizationId, input: context.req.valid('json') }));
  });
}
