import type { RouteDefinitionContext } from '../app/server.types';
import { z } from 'zod';
import { requireAuthentication } from '../app/auth/auth.middleware';
import { getUser } from '../app/auth/auth.models';
import { organizationIdSchema } from '../organizations/organization.schemas.legacy';
import { createOrganizationsRepository } from '../organizations/organizations.repository';
import { ensureUserIsInOrganization } from '../organizations/organizations.usecases';
import { legacyValidateJsonBody, legacyValidateParams, legacyValidateQuery } from '../shared/validation/validation.legacy';
import { createPurchaseInvoiceNotFoundError } from './purchases.errors';
import { matchPurchaseLinesWithSupplierProducts } from './purchases.product-matching';
import { createPurchasesRepository } from './purchases.repository';
import { purchaseInvoiceDraftSchema, purchaseInvoiceExtractionBodySchema, purchaseInvoiceIdSchema, purchaseInvoiceListQuerySchema, purchaseInvoiceStatusBodySchema, purchaseProductMatchesBodySchema, purchaseReadingsBodySchema, purchaseReadingsQuerySchema } from './purchases.schemas';
import { dismissPurchaseInboxDocument, listPurchaseInbox } from './readings/document-readings.inbox';
import { createDocumentReadingsRepository } from './readings/document-readings.repository';
import { wakeDocumentReadings } from './readings/document-readings.task';
import { filterOrganizationDocumentIds, formatReadingsForApi, getOrReadPurchaseDocument } from './readings/document-readings.usecases';

const organizationParamsSchema = z.object({ organizationId: organizationIdSchema });
const purchaseInvoiceParamsSchema = z.object({ organizationId: organizationIdSchema, purchaseInvoiceId: purchaseInvoiceIdSchema });

export function registerPurchasesRoutes(context: RouteDefinitionContext) {
  setupListPurchaseInvoicesRoute(context);
  // Before the invoice route: "readings" is not an invoice id
  setupGetPurchaseReadingsRoute(context);
  setupGetPurchaseInboxRoute(context);
  setupMatchPurchaseProductsRoute(context);
  setupDismissPurchaseInboxDocumentRoute(context);
  setupGetPurchaseInvoiceRoute(context);
  setupCreatePurchaseInvoiceRoute(context);
  setupUpdatePurchaseInvoiceRoute(context);
  setupSetPurchaseInvoiceStatusRoute(context);
  setupDeletePurchaseInvoiceRoute(context);
  setupExtractPurchaseInvoiceRoute(context);
  setupEnqueuePurchaseReadingsRoute(context);
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

      // A document read before (queued at upload) is answered at once, without calling the AI again
      const { extraction, status, checks } = await getOrReadPurchaseDocument({ organizationId, documentId, db, config, documentsStorageService });

      return context.json({ ...extraction, status, checks });
    },
  );
}

// Several documents uploaded at once are queued right away: by the time the user opens the first one, it is read
function setupEnqueuePurchaseReadingsRoute({ app, db, config, documentsStorageService, taskServices }: RouteDefinitionContext) {
  app.post(
    '/api/organizations/:organizationId/purchases/readings',
    requireAuthentication({ apiKeyPermissions: ['purchases:create'] }),
    legacyValidateParams(organizationParamsSchema),
    legacyValidateJsonBody(purchaseReadingsBodySchema),
    async (context) => {
      const { userId } = getUser({ context });
      const { organizationId } = context.req.valid('param');
      const { documentIds: requestedIds, force } = context.req.valid('json');

      await ensureUserIsInOrganization({ userId, organizationId, organizationsRepository: createOrganizationsRepository({ db }) });

      const { documentIds } = await filterOrganizationDocumentIds({ db, organizationId, documentIds: requestedIds });
      const { readings } = await createDocumentReadingsRepository({ db }).enqueueReadings({ organizationId, documentIds, kind: 'purchase', force });

      await wakeDocumentReadings({ taskServices, db, config, documentsStorageService });

      return context.json(await formatReadingsForApi({ db, organizationId, readings }), 202);
    },
  );
}

// Polled by the review screen while a document is being read
function setupGetPurchaseReadingsRoute({ app, db }: RouteDefinitionContext) {
  app.get(
    '/api/organizations/:organizationId/purchases/readings',
    requireAuthentication({ apiKeyPermissions: ['purchases:read'] }),
    legacyValidateParams(organizationParamsSchema),
    legacyValidateQuery(purchaseReadingsQuerySchema),
    async (context) => {
      const { userId } = getUser({ context });
      const { organizationId } = context.req.valid('param');
      const { documentIds } = context.req.valid('query');

      await ensureUserIsInOrganization({ userId, organizationId, organizationsRepository: createOrganizationsRepository({ db }) });

      const { readings } = await createDocumentReadingsRepository({ db }).getReadings({ organizationId, documentIds, kind: 'purchase' });

      return context.json(await formatReadingsForApi({ db, organizationId, readings }));
    },
  );
}

// The documents read as invoices to pay not registered yet (forwarded by email, uploaded and not reviewed)
function setupGetPurchaseInboxRoute({ app, db }: RouteDefinitionContext) {
  app.get(
    '/api/organizations/:organizationId/purchases/inbox',
    requireAuthentication({ apiKeyPermissions: ['purchases:read'] }),
    legacyValidateParams(organizationParamsSchema),
    async (context) => {
      const { userId } = getUser({ context });
      const { organizationId } = context.req.valid('param');

      await ensureUserIsInOrganization({ userId, organizationId, organizationsRepository: createOrganizationsRepository({ db }) });

      return context.json(await listPurchaseInbox({ db, organizationId }));
    },
  );
}

function setupDismissPurchaseInboxDocumentRoute({ app, db }: RouteDefinitionContext) {
  app.delete(
    '/api/organizations/:organizationId/purchases/inbox/:documentId',
    requireAuthentication({ apiKeyPermissions: ['purchases:update'] }),
    legacyValidateParams(z.object({ organizationId: organizationIdSchema, documentId: purchaseInvoiceIdSchema })),
    async (context) => {
      const { userId } = getUser({ context });
      const { organizationId, documentId } = context.req.valid('param');

      await ensureUserIsInOrganization({ userId, organizationId, organizationsRepository: createOrganizationsRepository({ db }) });

      await dismissPurchaseInboxDocument({ db, organizationId, documentId });

      return context.body(null, 204);
    },
  );
}

// The supplier's products each line of a purchase under review is, to compare the charged prices with the price list
function setupMatchPurchaseProductsRoute({ app, db, config }: RouteDefinitionContext) {
  app.post(
    '/api/organizations/:organizationId/purchases/product-matches',
    requireAuthentication({ apiKeyPermissions: ['purchases:create'] }),
    legacyValidateParams(organizationParamsSchema),
    legacyValidateJsonBody(purchaseProductMatchesBodySchema),
    async (context) => {
      const { userId } = getUser({ context });
      const { organizationId } = context.req.valid('param');
      const { supplierId, descriptions } = context.req.valid('json');

      await ensureUserIsInOrganization({ userId, organizationId, organizationsRepository: createOrganizationsRepository({ db }) });

      const { matches, isModelUnavailable } = await matchPurchaseLinesWithSupplierProducts({ db, config, organizationId, userId, supplierId, descriptions });

      return context.json({ matches, isModelUnavailable });
    },
  );
}
