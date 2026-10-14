/* eslint-disable style/max-statements-per-line */
import type { Buffer } from 'node:buffer';
import type { Database } from '../app/database/database.types';
import type { Context, RouteDefinitionContext } from '../app/server.types';
import type { GenericCustomPropertyEntityType } from '../custom-properties/custom-properties.constants';
import type { EntityCustomPropertiesInput } from '../custom-properties/entity-custom-properties.usecases';
import type { PdfInvoice } from './invoicing.pdf';
import { createHash } from 'node:crypto';
import { Readable } from 'node:stream';
import { z } from 'zod';
import { requireAuthentication } from '../app/auth/auth.middleware';
import { getUser } from '../app/auth/auth.models';
import { CUSTOM_PROPERTY_ENTITY_TYPES } from '../custom-properties/custom-properties.constants';
import { createCustomPropertiesRepository } from '../custom-properties/custom-properties.repository';
import { persistEntityWithCustomProperties, prepareEntityCustomPropertyValues } from '../custom-properties/entity-custom-properties.usecases';
import { createCustomPropertiesOptionsRepository } from '../custom-properties/options/custom-properties-options.repository';
import { createDocumentFoldersRepository } from '../documents/document-folders.repository';
import { createDocumentsRepository } from '../documents/documents.repository';
import { createDocumentCreationUsecase } from '../documents/documents.usecases';
import { organizationIdSchema } from '../organizations/organization.schemas.legacy';
import { createOrganizationsRepository } from '../organizations/organizations.repository';
import { ensureUserIsInOrganization } from '../organizations/organizations.usecases';
import { legacyValidateJsonBody, legacyValidateParams, legacyValidateQuery } from '../shared/validation/validation.legacy';
import { createInvoiceEmailRequiredError, createInvoiceNotFoundError, createInvoiceNotIssuableError } from './invoicing.errors';
import { renderInvoicePdf } from './invoicing.pdf';
import { createInvoicingRepository } from './invoicing.repository';
import { customerBodySchema, fiscalProfileSchema, invoiceBrandingSchema, invoiceDraftSchema, invoiceListQuerySchema, invoiceSeriesSchema, productBodySchema, salesRepresentativeBodySchema, taxRateSchema } from './invoicing.schemas';
import { createVerifactuRepository } from './verifactu.repository';

const resourceParams = z.object({
  organizationId: organizationIdSchema,
  resourceId: z.string().trim().min(1),
});

export function registerInvoicingRoutes(context: RouteDefinitionContext) {
  setupFiscalProfileRoutes(context);
  setupCustomerRoutes(context);
  setupSeriesRoutes(context);
  setupCatalogRoutes(context);
  setupVerifactuRoutes(context);
  setupInvoiceRoutes(context);
}

function setupVerifactuRoutes({ app, db }: RouteDefinitionContext) {
  const params = z.object({ organizationId: organizationIdSchema });
  app.get('/api/organizations/:organizationId/invoicing/verifactu/configuration', requireAuthentication(), legacyValidateParams(params), async (context) => {
    const { organizationId } = context.req.valid('param');
    await authorizeMember({ context, db, organizationId });
    return context.json(await createVerifactuRepository({ db }).getConfiguration({ organizationId }));
  });

  app.get('/api/organizations/:organizationId/invoicing/verifactu/records', requireAuthentication(), legacyValidateParams(params), async (context) => {
    const { organizationId } = context.req.valid('param');
    await authorizeMember({ context, db, organizationId });
    return context.json(await createVerifactuRepository({ db }).listRecords({ organizationId }));
  });
}

function setupFiscalProfileRoutes({ app, db }: RouteDefinitionContext) {
  app.get('/api/organizations/:organizationId/invoicing/profile', requireAuthentication(), legacyValidateParams(z.object({ organizationId: organizationIdSchema })), async (context) => {
    const { organizationId } = context.req.valid('param');
    await authorizeMember({ context, db, organizationId });
    return context.json(await createInvoicingRepository({ db }).getFiscalProfile({ organizationId }));
  });

  app.put('/api/organizations/:organizationId/invoicing/profile', requireAuthentication(), legacyValidateParams(z.object({ organizationId: organizationIdSchema })), legacyValidateJsonBody(fiscalProfileSchema), async (context) => {
    const { organizationId } = context.req.valid('param');
    await authorizeMember({ context, db, organizationId });
    return context.json(await createInvoicingRepository({ db }).upsertFiscalProfile({ organizationId, profile: context.req.valid('json') }));
  });
}

function setupCustomerRoutes({ app, db }: RouteDefinitionContext) {
  app.get('/api/organizations/:organizationId/invoicing/customers', requireAuthentication(), legacyValidateParams(z.object({ organizationId: organizationIdSchema })), async (context) => {
    const { organizationId } = context.req.valid('param');
    await authorizeMember({ context, db, organizationId });
    return context.json(await createInvoicingRepository({ db }).listCustomers({ organizationId }));
  });

  app.post('/api/organizations/:organizationId/invoicing/customers', requireAuthentication(), legacyValidateParams(z.object({ organizationId: organizationIdSchema })), legacyValidateJsonBody(customerBodySchema), async (context) => {
    const { organizationId } = context.req.valid('param');
    const { customProperties, ...customer } = context.req.valid('json');
    await authorizeMember({ context, db, organizationId });
    const created = await saveEntityWithCustomProperties({ db, organizationId, entityType: CUSTOM_PROPERTY_ENTITY_TYPES.CUSTOMER, customProperties, persistEntity: async ({ db: tx }) => (await createInvoicingRepository({ db: tx }).createCustomer({ organizationId, customer })).customer });
    return context.json({ customer: created }, 201);
  });

  app.put('/api/organizations/:organizationId/invoicing/customers/:resourceId', requireAuthentication(), legacyValidateParams(resourceParams), legacyValidateJsonBody(customerBodySchema), async (context) => {
    const { organizationId, resourceId: customerId } = context.req.valid('param');
    const { customProperties, ...customer } = context.req.valid('json');
    await authorizeMember({ context, db, organizationId });
    const updated = await saveEntityWithCustomProperties({ db, organizationId, entityType: CUSTOM_PROPERTY_ENTITY_TYPES.CUSTOMER, customProperties, persistEntity: async ({ db: tx }) => (await createInvoicingRepository({ db: tx }).updateCustomer({ organizationId, customerId, customer })).customer });
    return context.json({ customer: updated });
  });
}

function setupSeriesRoutes({ app, db }: RouteDefinitionContext) {
  app.get('/api/organizations/:organizationId/invoicing/series', requireAuthentication(), legacyValidateParams(z.object({ organizationId: organizationIdSchema })), async (context) => {
    const { organizationId } = context.req.valid('param');
    await authorizeMember({ context, db, organizationId });
    const repository = createInvoicingRepository({ db });
    await repository.ensureDefaultSeries({ organizationId });
    return context.json(await repository.listSeries({ organizationId }));
  });
  app.post('/api/organizations/:organizationId/invoicing/series', requireAuthentication(), legacyValidateParams(z.object({ organizationId: organizationIdSchema })), legacyValidateJsonBody(invoiceSeriesSchema), async (context) => {
    const { organizationId } = context.req.valid('param'); await authorizeMember({ context, db, organizationId });
    return context.json(await createInvoicingRepository({ db }).createSeries({ organizationId, series: context.req.valid('json') }), 201);
  });
  app.put('/api/organizations/:organizationId/invoicing/series/:resourceId', requireAuthentication(), legacyValidateParams(resourceParams), legacyValidateJsonBody(invoiceSeriesSchema), async (context) => {
    const { organizationId, resourceId: seriesId } = context.req.valid('param'); await authorizeMember({ context, db, organizationId });
    return context.json(await createInvoicingRepository({ db }).updateSeries({ organizationId, seriesId, series: context.req.valid('json') }));
  });
}

function setupCatalogRoutes({ app, db }: RouteDefinitionContext) {
  const organizationParams = z.object({ organizationId: organizationIdSchema });
  app.get('/api/organizations/:organizationId/invoicing/products', requireAuthentication(), legacyValidateParams(organizationParams), async (context) => {
    const { organizationId } = context.req.valid('param'); await authorizeMember({ context, db, organizationId }); return context.json(await createInvoicingRepository({ db }).listProducts({ organizationId }));
  });
  app.post('/api/organizations/:organizationId/invoicing/products', requireAuthentication(), legacyValidateParams(organizationParams), legacyValidateJsonBody(productBodySchema), async (context) => {
    const { organizationId } = context.req.valid('param'); const { customProperties, ...product } = context.req.valid('json'); await authorizeMember({ context, db, organizationId });
    const created = await saveEntityWithCustomProperties({ db, organizationId, entityType: CUSTOM_PROPERTY_ENTITY_TYPES.PRODUCT, customProperties, persistEntity: async ({ db: tx }) => (await createInvoicingRepository({ db: tx }).createProduct({ organizationId, product })).product });
    return context.json({ product: created }, 201);
  });
  app.put('/api/organizations/:organizationId/invoicing/products/:resourceId', requireAuthentication(), legacyValidateParams(resourceParams), legacyValidateJsonBody(productBodySchema), async (context) => {
    const { organizationId, resourceId: productId } = context.req.valid('param'); const { customProperties, ...product } = context.req.valid('json'); await authorizeMember({ context, db, organizationId });
    const updated = await saveEntityWithCustomProperties({ db, organizationId, entityType: CUSTOM_PROPERTY_ENTITY_TYPES.PRODUCT, customProperties, persistEntity: async ({ db: tx }) => (await createInvoicingRepository({ db: tx }).updateProduct({ organizationId, productId, product })).product });
    return context.json({ product: updated });
  });

  app.get('/api/organizations/:organizationId/invoicing/tax-rates', requireAuthentication(), legacyValidateParams(organizationParams), async (context) => {
    const { organizationId } = context.req.valid('param'); await authorizeMember({ context, db, organizationId }); return context.json(await createInvoicingRepository({ db }).listTaxRates({ organizationId }));
  });
  app.post('/api/organizations/:organizationId/invoicing/tax-rates', requireAuthentication(), legacyValidateParams(organizationParams), legacyValidateJsonBody(taxRateSchema), async (context) => {
    const { organizationId } = context.req.valid('param'); await authorizeMember({ context, db, organizationId }); return context.json(await createInvoicingRepository({ db }).createTaxRate({ organizationId, taxRate: context.req.valid('json') }), 201);
  });
  app.put('/api/organizations/:organizationId/invoicing/tax-rates/:resourceId', requireAuthentication(), legacyValidateParams(resourceParams), legacyValidateJsonBody(taxRateSchema), async (context) => {
    const { organizationId, resourceId: taxRateId } = context.req.valid('param'); await authorizeMember({ context, db, organizationId }); return context.json(await createInvoicingRepository({ db }).updateTaxRate({ organizationId, taxRateId, taxRate: context.req.valid('json') }));
  });

  app.get('/api/organizations/:organizationId/invoicing/sales-representatives', requireAuthentication(), legacyValidateParams(organizationParams), async (context) => {
    const { organizationId } = context.req.valid('param'); await authorizeMember({ context, db, organizationId }); return context.json(await createInvoicingRepository({ db }).listSalesRepresentatives({ organizationId }));
  });
  app.post('/api/organizations/:organizationId/invoicing/sales-representatives', requireAuthentication(), legacyValidateParams(organizationParams), legacyValidateJsonBody(salesRepresentativeBodySchema), async (context) => {
    const { organizationId } = context.req.valid('param'); const { customProperties, ...representative } = context.req.valid('json'); await authorizeMember({ context, db, organizationId });
    const created = await saveEntityWithCustomProperties({ db, organizationId, entityType: CUSTOM_PROPERTY_ENTITY_TYPES.SALES_REPRESENTATIVE, customProperties, persistEntity: async ({ db: tx }) => (await createInvoicingRepository({ db: tx }).createSalesRepresentative({ organizationId, representative })).salesRepresentative });
    return context.json({ salesRepresentative: created }, 201);
  });
  app.put('/api/organizations/:organizationId/invoicing/sales-representatives/:resourceId', requireAuthentication(), legacyValidateParams(resourceParams), legacyValidateJsonBody(salesRepresentativeBodySchema), async (context) => {
    const { organizationId, resourceId: representativeId } = context.req.valid('param'); const { customProperties, ...representative } = context.req.valid('json'); await authorizeMember({ context, db, organizationId });
    const updated = await saveEntityWithCustomProperties({ db, organizationId, entityType: CUSTOM_PROPERTY_ENTITY_TYPES.SALES_REPRESENTATIVE, customProperties, persistEntity: async ({ db: tx }) => (await createInvoicingRepository({ db: tx }).updateSalesRepresentative({ organizationId, representativeId, representative })).salesRepresentative });
    return context.json({ salesRepresentative: updated });
  });

  app.get('/api/organizations/:organizationId/invoicing/branding', requireAuthentication(), legacyValidateParams(organizationParams), async (context) => {
    const { organizationId } = context.req.valid('param'); await authorizeMember({ context, db, organizationId }); return context.json(await createInvoicingRepository({ db }).getBranding({ organizationId }));
  });
  app.put('/api/organizations/:organizationId/invoicing/branding', requireAuthentication(), legacyValidateParams(organizationParams), legacyValidateJsonBody(invoiceBrandingSchema), async (context) => {
    const { organizationId } = context.req.valid('param'); await authorizeMember({ context, db, organizationId }); return context.json(await createInvoicingRepository({ db }).upsertBranding({ organizationId, branding: context.req.valid('json') }));
  });
}

function setupInvoiceRoutes(routeContext: RouteDefinitionContext) {
  const { app, db } = routeContext;
  app.get('/api/organizations/:organizationId/invoicing/invoices', requireAuthentication(), legacyValidateParams(z.object({ organizationId: organizationIdSchema })), legacyValidateQuery(invoiceListQuerySchema), async (context) => {
    const { organizationId } = context.req.valid('param');
    const { status } = context.req.valid('query');
    await authorizeMember({ context, db, organizationId });
    return context.json(await createInvoicingRepository({ db }).listInvoices({ organizationId, status: Array.isArray(status) ? status[0] : status }));
  });

  app.post('/api/organizations/:organizationId/invoicing/invoices', requireAuthentication(), legacyValidateParams(z.object({ organizationId: organizationIdSchema })), legacyValidateJsonBody(invoiceDraftSchema), async (context) => {
    const { organizationId } = context.req.valid('param');
    const { userId } = getUser({ context });
    await authorizeMember({ context, db, organizationId });
    return context.json(await createInvoicingRepository({ db }).createInvoice({ organizationId, draft: context.req.valid('json'), userId }), 201);
  });

  app.get('/api/organizations/:organizationId/invoicing/invoices/:resourceId', requireAuthentication(), legacyValidateParams(resourceParams), async (context) => {
    const { organizationId, resourceId: invoiceId } = context.req.valid('param');
    await authorizeMember({ context, db, organizationId });
    const result = await createInvoicingRepository({ db }).getInvoice({ organizationId, invoiceId });
    if (!result.invoice) {
      throw createInvoiceNotFoundError();
    }
    return context.json(result);
  });

  app.put('/api/organizations/:organizationId/invoicing/invoices/:resourceId', requireAuthentication(), legacyValidateParams(resourceParams), legacyValidateJsonBody(invoiceDraftSchema), async (context) => {
    const { organizationId, resourceId: invoiceId } = context.req.valid('param');
    const { userId } = getUser({ context });
    await authorizeMember({ context, db, organizationId });
    return context.json(await createInvoicingRepository({ db }).updateInvoice({ organizationId, invoiceId, draft: context.req.valid('json'), userId }));
  });

  app.delete('/api/organizations/:organizationId/invoicing/invoices/:resourceId', requireAuthentication(), legacyValidateParams(resourceParams), async (context) => {
    const { organizationId, resourceId: invoiceId } = context.req.valid('param');
    await authorizeMember({ context, db, organizationId });
    await createInvoicingRepository({ db }).deleteDraft({ organizationId, invoiceId });
    return context.body(null, 204);
  });

  app.post('/api/organizations/:organizationId/invoicing/invoices/:resourceId/issue', requireAuthentication(), legacyValidateParams(resourceParams), async (context) => {
    const { organizationId, resourceId: invoiceId } = context.req.valid('param');
    const { userId } = getUser({ context });
    await authorizeMember({ context, db, organizationId });
    return context.json(await issueAndArchiveInvoice({ routeContext, organizationId, invoiceId, userId }));
  });

  app.get('/api/organizations/:organizationId/invoicing/invoices/:resourceId/pdf', requireAuthentication(), legacyValidateParams(resourceParams), async (context) => {
    const { organizationId, resourceId: invoiceId } = context.req.valid('param');
    await authorizeMember({ context, db, organizationId });
    const { invoice } = await createInvoicingRepository({ db }).getInvoice({ organizationId, invoiceId });
    if (!invoice) {
      throw createInvoiceNotFoundError();
    }
    if (invoice.status === 'draft') {
      throw createInvoiceNotIssuableError();
    }
    const { record } = await createVerifactuRepository({ db }).getRecordForInvoice({ organizationId, invoiceId });
    const pdf = await renderInvoicePdf({ ...invoice, verifactuQrUrl: record?.qrUrl ?? null } as PdfInvoice);
    return context.body(new Uint8Array(pdf), 200, {
      'Content-Type': 'application/pdf',
      'Content-Disposition': `attachment; filename="${safeFileName(invoice.number ?? invoice.id)}.pdf"`,
      'Cache-Control': 'private, no-store',
    });
  });

  app.post('/api/organizations/:organizationId/invoicing/invoices/:resourceId/send', requireAuthentication(), legacyValidateParams(resourceParams), async (context) => {
    const { organizationId, resourceId: invoiceId } = context.req.valid('param');
    const { userId } = getUser({ context });
    await authorizeMember({ context, db, organizationId });
    const repository = createInvoicingRepository({ db });
    let { invoice } = await repository.getInvoice({ organizationId, invoiceId });
    if (!invoice) {
      throw createInvoiceNotFoundError();
    }
    if (invoice.status === 'draft' || invoice.status === 'issuing') {
      ({ invoice } = await issueAndArchiveInvoice({ routeContext, organizationId, invoiceId, userId }));
    }
    const recipient = invoice?.customer?.email;
    if (recipient === null || recipient === undefined || recipient === '') {
      throw createInvoiceEmailRequiredError();
    }
    const { record } = await createVerifactuRepository({ db }).getRecordForInvoice({ organizationId, invoiceId });
    const pdf = await renderInvoicePdf({ ...invoice, verifactuQrUrl: record?.qrUrl ?? null } as PdfInvoice);
    const number = invoice!.number ?? invoice!.id;
    await routeContext.emailsServices.sendEmail({
      to: recipient,
      subject: `Invoice ${number}`,
      html: buildInvoiceEmail({ customerName: invoice!.customer?.name ?? '', number, totalMinor: invoice!.totalMinor, currency: invoice!.currency }),
      attachments: [{ filename: `${safeFileName(number)}.pdf`, content: pdf, contentType: 'application/pdf' }],
    });
    return context.json(await repository.markInvoiceSent({ organizationId, invoiceId, userId, recipient }));
  });

  app.post('/api/organizations/:organizationId/invoicing/invoices/:resourceId/paid', requireAuthentication(), legacyValidateParams(resourceParams), async (context) => {
    const { organizationId, resourceId: invoiceId } = context.req.valid('param');
    const { userId } = getUser({ context });
    await authorizeMember({ context, db, organizationId });
    return context.json(await createInvoicingRepository({ db }).markInvoicePaid({ organizationId, invoiceId, userId }));
  });
}

async function issueAndArchiveInvoice({ routeContext, organizationId, invoiceId, userId }: { routeContext: RouteDefinitionContext; organizationId: string; invoiceId: string; userId: string }) {
  const { db } = routeContext;
  const repository = createInvoicingRepository({ db });
  let { invoice } = await repository.getInvoice({ organizationId, invoiceId });
  if (!invoice) {
    throw createInvoiceNotFoundError();
  }
  if (invoice.status === 'issued' || invoice.status === 'sent' || invoice.status === 'paid') {
    if (invoice.documentId !== null) {
      await assignInvoiceDocumentToCustomerFolder({ routeContext, organizationId, invoice, documentId: invoice.documentId });
    }
    return { invoice };
  }
  ({ invoice } = await repository.reserveInvoiceNumber({ organizationId, invoiceId, userId }));
  const { record } = await createVerifactuRepository({ db }).ensureInvoiceRecord({ organizationId, invoiceId });
  const pdf = await renderInvoicePdf({ ...invoice, verifactuQrUrl: record?.qrUrl ?? null } as PdfInvoice);
  const documentId = await archiveInvoicePdf({ routeContext, organizationId, userId, invoice: invoice!, pdf });
  await assignInvoiceDocumentToCustomerFolder({ routeContext, organizationId, invoice: invoice!, documentId });
  return repository.finalizeInvoice({ organizationId, invoiceId, documentId, userId });
}

async function assignInvoiceDocumentToCustomerFolder({ routeContext, organizationId, invoice, documentId }: { routeContext: RouteDefinitionContext; organizationId: string; invoice: NonNullable<Awaited<ReturnType<ReturnType<typeof createInvoicingRepository>['getInvoice']>>['invoice']>; documentId: string }) {
  const foldersRepository = createDocumentFoldersRepository({ db: routeContext.db });
  const { folder } = await foldersRepository.ensureCustomerFolder({ organizationId, customerId: invoice.customerId, customerName: invoice.customer!.name });
  await foldersRepository.assignDocument({ organizationId, documentId, folderId: folder.id });
}

async function archiveInvoicePdf({ routeContext, organizationId, userId, invoice, pdf }: { routeContext: RouteDefinitionContext; organizationId: string; userId: string; invoice: NonNullable<Awaited<ReturnType<ReturnType<typeof createInvoicingRepository>['getInvoice']>>['invoice']>; pdf: Buffer }) {
  const documentsRepository = createDocumentsRepository({ db: routeContext.db });
  const sha256Hash = createHash('sha256').update(pdf).digest('hex');
  const { document: existingDocument } = await documentsRepository.getOrganizationDocumentBySha256Hash({ sha256Hash, organizationId });
  if (existingDocument && !existingDocument.isDeleted) {
    return existingDocument.id;
  }

  const createDocument = createDocumentCreationUsecase({ ...routeContext, isContentExtractionEnabled: false, documentsRepository });
  try {
    const { document } = await createDocument({
      fileStream: Readable.from(pdf),
      fileName: `${safeFileName(invoice.number ?? invoice.id)}.pdf`,
      mimeType: 'application/pdf',
      userId,
      organizationId,
    });
    return document.id;
  } catch (error) {
    // A concurrent or retried issue request may have archived this exact immutable PDF.
    const { document } = await documentsRepository.getOrganizationDocumentBySha256Hash({ sha256Hash, organizationId });
    if (document && !document.isDeleted) {
      return document.id;
    }
    throw error;
  }
}

// Validates the custom property values first, then writes the entity and its values in a single transaction
async function saveEntityWithCustomProperties<T extends { id: string }>({ db, organizationId, entityType, customProperties, persistEntity }: { db: Database; organizationId: string; entityType: GenericCustomPropertyEntityType; customProperties: EntityCustomPropertiesInput | undefined; persistEntity: (args: { db: Database }) => Promise<T> }) {
  const { entries } = await prepareEntityCustomPropertyValues({
    organizationId,
    entityType,
    input: customProperties ?? {},
    customPropertiesRepository: createCustomPropertiesRepository({ db }),
    customPropertiesOptionsRepository: createCustomPropertiesOptionsRepository({ db }),
    organizationsRepository: createOrganizationsRepository({ db }),
    documentsRepository: createDocumentsRepository({ db }),
  });

  return persistEntityWithCustomProperties({ db, organizationId, entityType, entries, persistEntity });
}

async function authorizeMember({ context, db, organizationId }: { context: Context; db: Database; organizationId: string }) {
  const { userId } = getUser({ context });
  await ensureUserIsInOrganization({ userId, organizationId, organizationsRepository: createOrganizationsRepository({ db }) });
}

function safeFileName(value: string) {
  return value.replace(/[^\w.-]+/g, '-');
}

function buildInvoiceEmail({ customerName, number, totalMinor, currency }: { customerName: string; number: string; totalMinor: number; currency: string }) {
  const safeName = escapeHtml(customerName);
  const safeNumber = escapeHtml(number);
  const total = new Intl.NumberFormat('en', { style: 'currency', currency }).format(totalMinor / 100);
  return `<p>Hello ${safeName},</p><p>Your invoice <strong>${safeNumber}</strong> for <strong>${escapeHtml(total)}</strong> is attached.</p><p>Thank you.</p>`;
}

function escapeHtml(value: string) {
  return value.replace(/[&<>'"]/g, character => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '\'': '&#39;', '"': '&quot;' })[character]!);
}
