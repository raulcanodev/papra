import type { RouteDefinitionContext } from '../app/server.types';
import { z } from 'zod';
import { requireAuthentication } from '../app/auth/auth.middleware';
import { getUser } from '../app/auth/auth.models';
import { organizationIdSchema } from '../organizations/organization.schemas.legacy';
import { createOrganizationsRepository } from '../organizations/organizations.repository';
import { ensureUserIsInOrganization } from '../organizations/organizations.usecases';
import { legacyValidateJsonBody, legacyValidateParams, legacyValidateQuery } from '../shared/validation/validation.legacy';
import { createPurchaseInvoiceNotFoundError } from './purchases.errors';
import { extractPurchaseInvoiceFromDocument } from './purchases.extraction.usecases';
import { createPurchasesRepository } from './purchases.repository';
import { purchaseInvoiceDraftSchema, purchaseInvoiceExtractionBodySchema, purchaseInvoiceIdSchema, purchaseInvoiceListQuerySchema, purchaseInvoiceStatusBodySchema } from './purchases.schemas';

const organizationParamsSchema = z.object({ organizationId: organizationIdSchema });
const purchaseInvoiceParamsSchema = z.object({ organizationId: organizationIdSchema, purchaseInvoiceId: purchaseInvoiceIdSchema });

export function registerPurchasesRoutes(context: RouteDefinitionContext) {
  setupListPurchaseInvoicesRoute(context);
  setupGetPurchaseInvoiceRoute(context);
  setupCreatePurchaseInvoiceRoute(context);
  setupUpdatePurchaseInvoiceRoute(context);
  setupSetPurchaseInvoiceStatusRoute(context);
  setupDeletePurchaseInvoiceRoute(context);
  setupExtractPurchaseInvoiceRoute(context);
}

function setupListPurchaseInvoicesRoute({ app, db }: RouteDefinitionContext) {
  app.get(
    '/api/organizations/:organizationId/purchases',
    requireAuthentication({ apiKeyPermissions: ['purchases:read'] }),
    legacyValidateParams(organizationParamsSchema),
    legacyValidateQuery(purchaseInvoiceListQuerySchema),
    async (context) => {
      const { userId } = getUser({ context });
      const { organizationId } = context.req.valid('param');
      const { status, from, to } = context.req.valid('query');

      await ensureUserIsInOrganization({ userId, organizationId, organizationsRepository: createOrganizationsRepository({ db }) });

      const { purchaseInvoices } = await createPurchasesRepository({ db }).listPurchaseInvoices({ organizationId, status, from, to });

      return context.json({ purchaseInvoices });
    },
  );
}

function setupGetPurchaseInvoiceRoute({ app, db }: RouteDefinitionContext) {
  app.get(
    '/api/organizations/:organizationId/purchases/:purchaseInvoiceId',
    requireAuthentication({ apiKeyPermissions: ['purchases:read'] }),
    legacyValidateParams(purchaseInvoiceParamsSchema),
    async (context) => {
      const { userId } = getUser({ context });
      const { organizationId, purchaseInvoiceId } = context.req.valid('param');

      await ensureUserIsInOrganization({ userId, organizationId, organizationsRepository: createOrganizationsRepository({ db }) });

      const { purchaseInvoice } = await createPurchasesRepository({ db }).getPurchaseInvoice({ organizationId, purchaseInvoiceId });

      if (!purchaseInvoice) {
        throw createPurchaseInvoiceNotFoundError();
      }

      return context.json({ purchaseInvoice });
    },
  );
}

function setupCreatePurchaseInvoiceRoute({ app, db }: RouteDefinitionContext) {
  app.post(
    '/api/organizations/:organizationId/purchases',
    requireAuthentication({ apiKeyPermissions: ['purchases:create'] }),
    legacyValidateParams(organizationParamsSchema),
    legacyValidateJsonBody(purchaseInvoiceDraftSchema),
    async (context) => {
      const { userId } = getUser({ context });
      const { organizationId } = context.req.valid('param');
      const draft = context.req.valid('json');

      await ensureUserIsInOrganization({ userId, organizationId, organizationsRepository: createOrganizationsRepository({ db }) });

      const { purchaseInvoice } = await createPurchasesRepository({ db }).createPurchaseInvoice({ organizationId, draft });

      return context.json({ purchaseInvoice }, 201);
    },
  );
}

function setupUpdatePurchaseInvoiceRoute({ app, db }: RouteDefinitionContext) {
  app.put(
    '/api/organizations/:organizationId/purchases/:purchaseInvoiceId',
    requireAuthentication({ apiKeyPermissions: ['purchases:update'] }),
    legacyValidateParams(purchaseInvoiceParamsSchema),
    legacyValidateJsonBody(purchaseInvoiceDraftSchema),
    async (context) => {
      const { userId } = getUser({ context });
      const { organizationId, purchaseInvoiceId } = context.req.valid('param');
      const draft = context.req.valid('json');

      await ensureUserIsInOrganization({ userId, organizationId, organizationsRepository: createOrganizationsRepository({ db }) });

      const { purchaseInvoice } = await createPurchasesRepository({ db }).updatePurchaseInvoice({ organizationId, purchaseInvoiceId, draft });

      return context.json({ purchaseInvoice });
    },
  );
}

function setupSetPurchaseInvoiceStatusRoute({ app, db }: RouteDefinitionContext) {
  app.patch(
    '/api/organizations/:organizationId/purchases/:purchaseInvoiceId/status',
    requireAuthentication({ apiKeyPermissions: ['purchases:update'] }),
    legacyValidateParams(purchaseInvoiceParamsSchema),
    legacyValidateJsonBody(purchaseInvoiceStatusBodySchema),
    async (context) => {
      const { userId } = getUser({ context });
      const { organizationId, purchaseInvoiceId } = context.req.valid('param');
      const { status } = context.req.valid('json');

      await ensureUserIsInOrganization({ userId, organizationId, organizationsRepository: createOrganizationsRepository({ db }) });

      const { purchaseInvoice } = await createPurchasesRepository({ db }).setPurchaseInvoiceStatus({ organizationId, purchaseInvoiceId, status });

      return context.json({ purchaseInvoice });
    },
  );
}

function setupDeletePurchaseInvoiceRoute({ app, db }: RouteDefinitionContext) {
  app.delete(
    '/api/organizations/:organizationId/purchases/:purchaseInvoiceId',
    requireAuthentication({ apiKeyPermissions: ['purchases:delete'] }),
    legacyValidateParams(purchaseInvoiceParamsSchema),
    async (context) => {
      const { userId } = getUser({ context });
      const { organizationId, purchaseInvoiceId } = context.req.valid('param');

      await ensureUserIsInOrganization({ userId, organizationId, organizationsRepository: createOrganizationsRepository({ db }) });

      await createPurchasesRepository({ db }).deletePurchaseInvoice({ organizationId, purchaseInvoiceId });

      return context.body(null, 204);
    },
  );
}

function setupExtractPurchaseInvoiceRoute({ app, db, config, documentsStorageService }: RouteDefinitionContext) {
  app.post(
    '/api/organizations/:organizationId/purchases/extract',
    requireAuthentication({ apiKeyPermissions: ['purchases:create'] }),
    legacyValidateParams(organizationParamsSchema),
    legacyValidateJsonBody(purchaseInvoiceExtractionBodySchema),
    async (context) => {
      const { userId } = getUser({ context });
      const { organizationId } = context.req.valid('param');
      const { documentId } = context.req.valid('json');

      await ensureUserIsInOrganization({ userId, organizationId, organizationsRepository: createOrganizationsRepository({ db }) });

      const extraction = await extractPurchaseInvoiceFromDocument({ organizationId, documentId, db, config, documentsStorageService });

      return context.json(extraction);
    },
  );
}
