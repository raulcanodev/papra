import type { RouteDefinitionContext } from '../app/server.types';
import { z } from 'zod';
import { requireAuthentication } from '../app/auth/auth.middleware';
import { getUser } from '../app/auth/auth.models';
import { createContactsRepository } from '../contacts/contacts.repository';
import { createInvoicingRepository } from '../invoicing/invoicing.repository';
import { organizationIdSchema } from '../organizations/organization.schemas.legacy';
import { createOrganizationsRepository } from '../organizations/organizations.repository';
import { ensureUserIsInOrganization } from '../organizations/organizations.usecases';
import { legacyValidateJsonBody, legacyValidateParams, legacyValidateQuery } from '../shared/validation/validation.legacy';
import { createDeliveryNoteNotFoundError } from './delivery-notes.errors';
import { renderDeliveryNotePdf } from './delivery-notes.pdf';
import { readDeliveryNote } from './delivery-notes.reading';
import { createDeliveryNotesRepository } from './delivery-notes.repository';
import { deliveryNoteDraftSchema, deliveryNoteIdSchema, deliveryNoteListQuerySchema, deliveryNoteReadingBodySchema, deliveryNotesInvoiceBodySchema } from './delivery-notes.schemas';
import { invoiceDeliveryNotes } from './delivery-notes.usecases';

const organizationParamsSchema = z.object({ organizationId: organizationIdSchema });
const deliveryNoteParamsSchema = z.object({ organizationId: organizationIdSchema, deliveryNoteId: deliveryNoteIdSchema });

// Delivery notes come before the invoice they end up on: they share the invoices permissions
export function registerDeliveryNotesRoutes(context: RouteDefinitionContext) {
  setupListDeliveryNotesRoute(context);
  // Before the delivery note routes: "read" and "invoice" are not ids
  setupReadDeliveryNoteRoute(context);
  setupInvoiceDeliveryNotesRoute(context);
  setupGetDeliveryNoteRoute(context);
  setupDeliveryNotePdfRoute(context);
  setupCreateDeliveryNoteRoute(context);
  setupUpdateDeliveryNoteRoute(context);
  setupDeleteDeliveryNoteRoute(context);
}

async function authorizeMember({ db, userId, organizationId }: { db: RouteDefinitionContext['db']; userId: string; organizationId: string }) {
  await ensureUserIsInOrganization({ userId, organizationId, organizationsRepository: createOrganizationsRepository({ db }) });
}

function setupListDeliveryNotesRoute({ app, db }: RouteDefinitionContext) {
  app.get(
    '/api/organizations/:organizationId/delivery-notes',
    requireAuthentication({ apiKeyPermissions: ['invoices:read'] }),
    legacyValidateParams(organizationParamsSchema),
    legacyValidateQuery(deliveryNoteListQuerySchema),
    async (context) => {
      const { userId } = getUser({ context });
      const { organizationId } = context.req.valid('param');
      const { status, customerId } = context.req.valid('query');

      await authorizeMember({ db, userId, organizationId });

      return context.json(await createDeliveryNotesRepository({ db }).listDeliveryNotes({ organizationId, status, customerId }));
    },
  );
}

function setupGetDeliveryNoteRoute({ app, db }: RouteDefinitionContext) {
  app.get(
    '/api/organizations/:organizationId/delivery-notes/:deliveryNoteId',
    requireAuthentication({ apiKeyPermissions: ['invoices:read'] }),
    legacyValidateParams(deliveryNoteParamsSchema),
    async (context) => {
      const { userId } = getUser({ context });
      const { organizationId, deliveryNoteId } = context.req.valid('param');

      await authorizeMember({ db, userId, organizationId });

      const { deliveryNote } = await createDeliveryNotesRepository({ db }).getDeliveryNote({ organizationId, deliveryNoteId });

      if (!deliveryNote) {
        throw createDeliveryNoteNotFoundError();
      }

      return context.json({ deliveryNote });
    },
  );
}

// The paper to print and hand with the goods, for the carrier and the customer to sign
function setupDeliveryNotePdfRoute({ app, db }: RouteDefinitionContext) {
  app.get(
    '/api/organizations/:organizationId/delivery-notes/:deliveryNoteId/pdf',
    requireAuthentication({ apiKeyPermissions: ['invoices:read'] }),
    legacyValidateParams(deliveryNoteParamsSchema),
    async (context) => {
      const { userId } = getUser({ context });
      const { organizationId, deliveryNoteId } = context.req.valid('param');

      await authorizeMember({ db, userId, organizationId });

      const { deliveryNote } = await createDeliveryNotesRepository({ db }).getDeliveryNote({ organizationId, deliveryNoteId });

      if (!deliveryNote) {
        throw createDeliveryNoteNotFoundError();
      }

      const invoicingRepository = createInvoicingRepository({ db });
      const [{ profile }, { branding }, { organization }, { contact: customer }] = await Promise.all([
        invoicingRepository.getFiscalProfile({ organizationId }),
        invoicingRepository.getBranding({ organizationId }),
        createOrganizationsRepository({ db }).getOrganizationById({ organizationId }),
        createContactsRepository({ db }).getContact({ organizationId, contactId: deliveryNote.customerId }),
      ]);

      const pdf = await renderDeliveryNotePdf({
        deliveryNote,
        // Who it is from: the fiscal profile, else just the workspace name
        seller: profile ? { ...profile, name: profile.legalName } : { name: organization?.name ?? '' },
        customer: customer ?? { name: deliveryNote.customerName },
        accentColor: branding?.accentColor ?? null,
        locale: profile?.locale ?? 'es-ES',
      });

      return context.body(new Uint8Array(pdf), 200, {
        'Content-Type': 'application/pdf',
        'Content-Disposition': `inline; filename="albaran-${(deliveryNote.number ?? deliveryNote.id).replace(/[^\w.-]+/g, '-')}.pdf"`,
        'Cache-Control': 'private, no-store',
      });
    },
  );
}

function setupCreateDeliveryNoteRoute({ app, db }: RouteDefinitionContext) {
  app.post(
    '/api/organizations/:organizationId/delivery-notes',
    requireAuthentication({ apiKeyPermissions: ['invoices:create'] }),
    legacyValidateParams(organizationParamsSchema),
    legacyValidateJsonBody(deliveryNoteDraftSchema),
    async (context) => {
      const { userId } = getUser({ context });
      const { organizationId } = context.req.valid('param');

      await authorizeMember({ db, userId, organizationId });

      return context.json(await createDeliveryNotesRepository({ db }).createDeliveryNote({ organizationId, draft: context.req.valid('json') }), 201);
    },
  );
}

function setupUpdateDeliveryNoteRoute({ app, db }: RouteDefinitionContext) {
  app.put(
    '/api/organizations/:organizationId/delivery-notes/:deliveryNoteId',
    requireAuthentication({ apiKeyPermissions: ['invoices:update'] }),
    legacyValidateParams(deliveryNoteParamsSchema),
    legacyValidateJsonBody(deliveryNoteDraftSchema),
    async (context) => {
      const { userId } = getUser({ context });
      const { organizationId, deliveryNoteId } = context.req.valid('param');

      await authorizeMember({ db, userId, organizationId });

      return context.json(await createDeliveryNotesRepository({ db }).updateDeliveryNote({ organizationId, deliveryNoteId, draft: context.req.valid('json') }));
    },
  );
}

function setupDeleteDeliveryNoteRoute({ app, db }: RouteDefinitionContext) {
  app.delete(
    '/api/organizations/:organizationId/delivery-notes/:deliveryNoteId',
    requireAuthentication({ apiKeyPermissions: ['invoices:delete'] }),
    legacyValidateParams(deliveryNoteParamsSchema),
    async (context) => {
      const { userId } = getUser({ context });
      const { organizationId, deliveryNoteId } = context.req.valid('param');

      await authorizeMember({ db, userId, organizationId });
      await createDeliveryNotesRepository({ db }).deleteDeliveryNote({ organizationId, deliveryNoteId });

      return context.body(null, 204);
    },
  );
}

// The photo is uploaded first as a document of the organization, then read here: nothing is saved until the user confirms
function setupReadDeliveryNoteRoute({ app, db, config, documentsStorageService }: RouteDefinitionContext) {
  app.post(
    '/api/organizations/:organizationId/delivery-notes/read',
    requireAuthentication({ apiKeyPermissions: ['invoices:create'] }),
    legacyValidateParams(organizationParamsSchema),
    legacyValidateJsonBody(deliveryNoteReadingBodySchema),
    async (context) => {
      const { userId } = getUser({ context });
      const { organizationId } = context.req.valid('param');
      const { documentId } = context.req.valid('json');

      await authorizeMember({ db, userId, organizationId });

      return context.json({ reading: await readDeliveryNote({ db, config, documentsStorageService, organizationId, documentId }) });
    },
  );
}

function setupInvoiceDeliveryNotesRoute({ app, db }: RouteDefinitionContext) {
  app.post(
    '/api/organizations/:organizationId/delivery-notes/invoice',
    requireAuthentication({ apiKeyPermissions: ['invoices:create'] }),
    legacyValidateParams(organizationParamsSchema),
    legacyValidateJsonBody(deliveryNotesInvoiceBodySchema),
    async (context) => {
      const { userId } = getUser({ context });
      const { organizationId } = context.req.valid('param');
      const { deliveryNoteIds } = context.req.valid('json');

      await authorizeMember({ db, userId, organizationId });

      return context.json(await invoiceDeliveryNotes({ db, organizationId, deliveryNoteIds, userId }), 201);
    },
  );
}
