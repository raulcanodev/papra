/* eslint-disable style/max-statements-per-line */
import type { Database } from '../app/database/database.types';
import type { Context, RouteDefinitionContext } from '../app/server.types';
import type { PdfInvoice } from './invoicing.pdf';
import { Buffer } from 'node:buffer';
import { createHash } from 'node:crypto';
import { Readable } from 'node:stream';
import { z } from 'zod';
import { requireAuthentication } from '../app/auth/auth.middleware';
import { getUser } from '../app/auth/auth.models';
import { CUSTOM_PROPERTY_ENTITY_TYPES } from '../custom-properties/custom-properties.constants';
import { saveEntityWithCustomProperties } from '../custom-properties/entity-custom-properties.usecases';
import { createDocumentFoldersRepository } from '../documents/document-folders.repository';
import { createDocumentsRepository } from '../documents/documents.repository';
import { createDocumentCreationUsecase } from '../documents/documents.usecases';
import { formatSenderAddress } from '../emails/emails.models';
import { organizationIdSchema } from '../organizations/organization.schemas.legacy';
import { createOrganizationsRepository } from '../organizations/organizations.repository';
import { ensureUserIsInOrganization } from '../organizations/organizations.usecases';
import { collectStreamToFile } from '../shared/streams/stream.convertion';
import { legacyValidateJsonBody, legacyValidateParams, legacyValidateQuery } from '../shared/validation/validation.legacy';
import { createInvoiceEmailRequiredError, createInvoiceNotFoundError, createInvoiceNotIssuableError } from './invoicing.errors';
import { getInvoicePayableMinor } from './invoicing.models';
import { renderInvoicePdf } from './invoicing.pdf';
import { renderInvoicePreviewPdf } from './invoicing.preview';
import { createInvoicingRepository } from './invoicing.repository';
import { fiscalProfileSchema, importedInvoiceSchema, invoiceBrandingSchema, invoiceDraftSchema, invoiceListQuerySchema, invoiceSeriesSchema, productBodySchema, productListQuerySchema, taxRateSchema } from './invoicing.schemas';
import { createVerifactuRepository } from './verifactu.repository';

const resourceParams = z.object({
  organizationId: organizationIdSchema,
  resourceId: z.string().trim().min(1),
});

export function registerInvoicingRoutes(context: RouteDefinitionContext) {
  setupFiscalProfileRoutes(context);
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
  app.get('/api/organizations/:organizationId/invoicing/profile', requireAuthentication({ apiKeyPermissions: ['invoices:read'] }), legacyValidateParams(z.object({ organizationId: organizationIdSchema })), async (context) => {
    const { organizationId } = context.req.valid('param');
    await authorizeMember({ context, db, organizationId });
    return context.json(await createInvoicingRepository({ db }).getFiscalProfile({ organizationId }));
  });

  app.put('/api/organizations/:organizationId/invoicing/profile', requireAuthentication({ apiKeyPermissions: ['invoices:update'] }), legacyValidateParams(z.object({ organizationId: organizationIdSchema })), legacyValidateJsonBody(fiscalProfileSchema), async (context) => {
    const { organizationId } = context.req.valid('param');
    await authorizeMember({ context, db, organizationId });
    return context.json(await createInvoicingRepository({ db }).upsertFiscalProfile({ organizationId, profile: context.req.valid('json') }));
  });
}

function setupSeriesRoutes({ app, db }: RouteDefinitionContext) {
  app.get('/api/organizations/:organizationId/invoicing/series', requireAuthentication({ apiKeyPermissions: ['invoices:read'] }), legacyValidateParams(z.object({ organizationId: organizationIdSchema })), async (context) => {
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
  app.get('/api/organizations/:organizationId/invoicing/products', requireAuthentication({ apiKeyPermissions: ['products:read'] }), legacyValidateParams(organizationParams), legacyValidateQuery(productListQuerySchema), async (context) => {
    const { organizationId } = context.req.valid('param'); const { contactId } = context.req.valid('query'); await authorizeMember({ context, db, organizationId }); return context.json(await createInvoicingRepository({ db }).listProducts({ organizationId, contactId }));
  });
  app.post('/api/organizations/:organizationId/invoicing/products', requireAuthentication({ apiKeyPermissions: ['products:create'] }), legacyValidateParams(organizationParams), legacyValidateJsonBody(productBodySchema), async (context) => {
    const { organizationId } = context.req.valid('param'); const { customProperties, ...product } = context.req.valid('json'); await authorizeMember({ context, db, organizationId });
    const created = await saveEntityWithCustomProperties({ db, organizationId, entityTypes: [CUSTOM_PROPERTY_ENTITY_TYPES.PRODUCT], customProperties, persistEntity: async ({ db: tx }) => (await createInvoicingRepository({ db: tx }).createProduct({ organizationId, product })).product });
    return context.json({ product: created }, 201);
  });
  app.put('/api/organizations/:organizationId/invoicing/products/:resourceId', requireAuthentication({ apiKeyPermissions: ['products:update'] }), legacyValidateParams(resourceParams), legacyValidateJsonBody(productBodySchema), async (context) => {
    const { organizationId, resourceId: productId } = context.req.valid('param'); const { customProperties, ...product } = context.req.valid('json'); await authorizeMember({ context, db, organizationId });
    const updated = await saveEntityWithCustomProperties({ db, organizationId, entityTypes: [CUSTOM_PROPERTY_ENTITY_TYPES.PRODUCT], customProperties, persistEntity: async ({ db: tx }) => (await createInvoicingRepository({ db: tx }).updateProduct({ organizationId, productId, product })).product });
    return context.json({ product: updated });
  });

  app.delete('/api/organizations/:organizationId/invoicing/products/:resourceId', requireAuthentication({ apiKeyPermissions: ['products:delete'] }), legacyValidateParams(resourceParams), async (context) => {
    const { organizationId, resourceId: productId } = context.req.valid('param');
    await authorizeMember({ context, db, organizationId });
    await createInvoicingRepository({ db }).archiveProduct({ organizationId, productId });
    return context.body(null, 204);
  });

  app.get('/api/organizations/:organizationId/invoicing/tax-rates', requireAuthentication({ apiKeyPermissions: ['products:read'] }), legacyValidateParams(organizationParams), async (context) => {
    const { organizationId } = context.req.valid('param'); await authorizeMember({ context, db, organizationId }); return context.json(await createInvoicingRepository({ db }).listTaxRates({ organizationId }));
  });
  app.post('/api/organizations/:organizationId/invoicing/tax-rates', requireAuthentication({ apiKeyPermissions: ['products:create'] }), legacyValidateParams(organizationParams), legacyValidateJsonBody(taxRateSchema), async (context) => {
    const { organizationId } = context.req.valid('param'); await authorizeMember({ context, db, organizationId }); return context.json(await createInvoicingRepository({ db }).createTaxRate({ organizationId, taxRate: context.req.valid('json') }), 201);
  });
  app.put('/api/organizations/:organizationId/invoicing/tax-rates/:resourceId', requireAuthentication({ apiKeyPermissions: ['products:update'] }), legacyValidateParams(resourceParams), legacyValidateJsonBody(taxRateSchema), async (context) => {
    const { organizationId, resourceId: taxRateId } = context.req.valid('param'); await authorizeMember({ context, db, organizationId }); return context.json(await createInvoicingRepository({ db }).updateTaxRate({ organizationId, taxRateId, taxRate: context.req.valid('json') }));
  });

  app.delete('/api/organizations/:organizationId/invoicing/tax-rates/:resourceId', requireAuthentication({ apiKeyPermissions: ['products:delete'] }), legacyValidateParams(resourceParams), async (context) => {
    const { organizationId, resourceId: taxRateId } = context.req.valid('param');
    await authorizeMember({ context, db, organizationId });
    await createInvoicingRepository({ db }).archiveTaxRate({ organizationId, taxRateId });
    return context.body(null, 204);
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
  app.get('/api/organizations/:organizationId/invoicing/invoices', requireAuthentication({ apiKeyPermissions: ['invoices:read'] }), legacyValidateParams(z.object({ organizationId: organizationIdSchema })), legacyValidateQuery(invoiceListQuerySchema), async (context) => {
    const { organizationId } = context.req.valid('param');
    const { status } = context.req.valid('query');
    await authorizeMember({ context, db, organizationId });
    return context.json(await createInvoicingRepository({ db }).listInvoices({ organizationId, status: Array.isArray(status) ? status[0] : status }));
  });

  // The PDF of the form as it is, watermarked, nothing saved: what the invoice would look like issued now
  app.post('/api/organizations/:organizationId/invoicing/invoices/preview', requireAuthentication({ apiKeyPermissions: ['invoices:read'] }), legacyValidateParams(z.object({ organizationId: organizationIdSchema })), legacyValidateJsonBody(invoiceDraftSchema), async (context) => {
    const { organizationId } = context.req.valid('param');
    await authorizeMember({ context, db, organizationId });
    const { pdf, number } = await renderInvoicePreviewPdf({ db, organizationId, draft: context.req.valid('json') });
    return context.body(new Uint8Array(pdf), 200, {
      'Content-Type': 'application/pdf',
      'Content-Disposition': `attachment; filename="${safeFileName(`${number ?? 'invoice'}-preview.pdf`)}"`,
      'Cache-Control': 'private, no-store',
    });
  });

  app.post('/api/organizations/:organizationId/invoicing/invoices', requireAuthentication({ apiKeyPermissions: ['invoices:create'] }), legacyValidateParams(z.object({ organizationId: organizationIdSchema })), legacyValidateJsonBody(invoiceDraftSchema), async (context) => {
    const { organizationId } = context.req.valid('param');
    const { userId } = getUser({ context });
    await authorizeMember({ context, db, organizationId });
    return context.json(await createInvoicingRepository({ db }).createInvoice({ organizationId, draft: context.req.valid('json'), userId }), 201);
  });

  // An invoice issued before the app, registered from its uploaded paper
  app.post('/api/organizations/:organizationId/invoicing/invoices/import', requireAuthentication({ apiKeyPermissions: ['invoices:create'] }), legacyValidateParams(z.object({ organizationId: organizationIdSchema })), legacyValidateJsonBody(importedInvoiceSchema), async (context) => {
    const { organizationId } = context.req.valid('param');
    const { userId } = getUser({ context });
    await authorizeMember({ context, db, organizationId });
    const { invoice } = await createInvoicingRepository({ db }).importIssuedInvoice({ organizationId, input: context.req.valid('json'), userId });
    await assignInvoiceDocumentToContactFolder({ routeContext, organizationId, invoice: invoice!, documentId: invoice!.documentId! });
    return context.json({ invoice }, 201);
  });

  app.get('/api/organizations/:organizationId/invoicing/invoices/:resourceId', requireAuthentication({ apiKeyPermissions: ['invoices:read'] }), legacyValidateParams(resourceParams), async (context) => {
    const { organizationId, resourceId: invoiceId } = context.req.valid('param');
    await authorizeMember({ context, db, organizationId });
    const result = await createInvoicingRepository({ db }).getInvoice({ organizationId, invoiceId });
    if (!result.invoice) {
      throw createInvoiceNotFoundError();
    }
    return context.json(result);
  });

  app.put('/api/organizations/:organizationId/invoicing/invoices/:resourceId', requireAuthentication({ apiKeyPermissions: ['invoices:update'] }), legacyValidateParams(resourceParams), legacyValidateJsonBody(invoiceDraftSchema), async (context) => {
    const { organizationId, resourceId: invoiceId } = context.req.valid('param');
    const { userId } = getUser({ context });
    await authorizeMember({ context, db, organizationId });
    return context.json(await createInvoicingRepository({ db }).updateInvoice({ organizationId, invoiceId, draft: context.req.valid('json'), userId }));
  });

  app.delete('/api/organizations/:organizationId/invoicing/invoices/:resourceId', requireAuthentication({ apiKeyPermissions: ['invoices:delete'] }), legacyValidateParams(resourceParams), async (context) => {
    const { organizationId, resourceId: invoiceId } = context.req.valid('param');
    await authorizeMember({ context, db, organizationId });
    await createInvoicingRepository({ db }).deleteDraft({ organizationId, invoiceId });
    return context.body(null, 204);
  });

  app.post('/api/organizations/:organizationId/invoicing/invoices/:resourceId/issue', requireAuthentication({ apiKeyPermissions: ['invoices:update'] }), legacyValidateParams(resourceParams), async (context) => {
    const { organizationId, resourceId: invoiceId } = context.req.valid('param');
    const { userId } = getUser({ context });
    await authorizeMember({ context, db, organizationId });
    return context.json(await issueAndArchiveInvoice({ routeContext, organizationId, invoiceId, userId }));
  });

  app.get('/api/organizations/:organizationId/invoicing/invoices/:resourceId/pdf', requireAuthentication({ apiKeyPermissions: ['invoices:read'] }), legacyValidateParams(resourceParams), async (context) => {
    const { organizationId, resourceId: invoiceId } = context.req.valid('param');
    await authorizeMember({ context, db, organizationId });
    const { invoice } = await createInvoicingRepository({ db }).getInvoice({ organizationId, invoiceId });
    if (!invoice) {
      throw createInvoiceNotFoundError();
    }
    if (invoice.status === 'draft') {
      throw createInvoiceNotIssuableError();
    }
    const { file } = await getInvoiceFile({ routeContext, organizationId, invoice });
    return context.body(new Uint8Array(file.content), 200, {
      'Content-Type': file.contentType,
      'Content-Disposition': `attachment; filename="${safeFileName(file.filename)}"`,
      'Cache-Control': 'private, no-store',
    });
  });

  app.post('/api/organizations/:organizationId/invoicing/invoices/:resourceId/send', requireAuthentication({ apiKeyPermissions: ['invoices:update'] }), legacyValidateParams(resourceParams), async (context) => {
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
    const { file } = await getInvoiceFile({ routeContext, organizationId, invoice: invoice! });
    const number = invoice!.number ?? invoice!.id;
    const { sender } = await getInvoiceSender({ db, organizationId, fromEmail: routeContext.config.emails.fromEmail });
    await routeContext.emailsServices.sendEmail({
      ...sender,
      to: recipient,
      subject: `Invoice ${number}`,
      html: buildInvoiceEmail({ customerName: invoice!.customer?.name ?? '', number, amountDueMinor: getInvoicePayableMinor(invoice!), currency: invoice!.currency }),
      attachments: [{ filename: safeFileName(file.filename), content: file.content, contentType: file.contentType }],
    });
    return context.json(await repository.markInvoiceSent({ organizationId, invoiceId, userId, recipient }));
  });

  app.post('/api/organizations/:organizationId/invoicing/invoices/:resourceId/paid', requireAuthentication({ apiKeyPermissions: ['invoices:update'] }), legacyValidateParams(resourceParams), async (context) => {
    const { organizationId, resourceId: invoiceId } = context.req.valid('param');
    const { userId } = getUser({ context });
    await authorizeMember({ context, db, organizationId });
    return context.json(await createInvoicingRepository({ db }).markInvoicePaid({ organizationId, invoiceId, userId }));
  });
}

type StoredInvoice = NonNullable<Awaited<ReturnType<ReturnType<typeof createInvoicingRepository>['getInvoice']>>['invoice']>;

// The file of an issued invoice: the PDF rendered from its data, or the original paper of an imported one
async function getInvoiceFile({ routeContext, organizationId, invoice }: { routeContext: RouteDefinitionContext; organizationId: string; invoice: StoredInvoice }) {
  const number = invoice.number ?? invoice.id;

  if (invoice.importedAt !== null && invoice.documentId !== null) {
    const { document } = await createDocumentsRepository({ db: routeContext.db }).getDocumentById({ documentId: invoice.documentId, organizationId });
    if (document) {
      const { fileStream } = await routeContext.documentsStorageService.getFileStream({
        storageKey: document.originalStorageKey,
        fileEncryptionAlgorithm: document.fileEncryptionAlgorithm,
        fileEncryptionKekVersion: document.fileEncryptionKekVersion,
        fileEncryptionKeyWrapped: document.fileEncryptionKeyWrapped,
      });
      const { file } = await collectStreamToFile({ fileStream, fileName: document.name, mimeType: document.mimeType });
      const extension = document.name.includes('.') ? document.name.slice(document.name.lastIndexOf('.')) : '';

      return { file: { content: Buffer.from(await file.arrayBuffer()), contentType: document.mimeType, filename: `${number}${extension}` } };
    }
  }

  const { record } = await createVerifactuRepository({ db: routeContext.db }).getRecordForInvoice({ organizationId, invoiceId: invoice.id });
  const pdf = await renderInvoicePdf({ ...invoice, verifactuQrUrl: record?.qrUrl ?? null } as PdfInvoice);

  return { file: { content: pdf, contentType: 'application/pdf', filename: `${number}.pdf` } };
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
      await assignInvoiceDocumentToContactFolder({ routeContext, organizationId, invoice, documentId: invoice.documentId });
    }
    return { invoice };
  }
  ({ invoice } = await repository.reserveInvoiceNumber({ organizationId, invoiceId, userId }));
  const { record } = await createVerifactuRepository({ db }).ensureInvoiceRecord({ organizationId, invoiceId });
  const pdf = await renderInvoicePdf({ ...invoice, verifactuQrUrl: record?.qrUrl ?? null } as PdfInvoice);
  const documentId = await archiveInvoicePdf({ routeContext, organizationId, userId, invoice: invoice!, pdf });
  await assignInvoiceDocumentToContactFolder({ routeContext, organizationId, invoice: invoice!, documentId });
  return repository.finalizeInvoice({ organizationId, invoiceId, documentId, userId });
}

async function assignInvoiceDocumentToContactFolder({ routeContext, organizationId, invoice, documentId }: { routeContext: RouteDefinitionContext; organizationId: string; invoice: NonNullable<Awaited<ReturnType<ReturnType<typeof createInvoicingRepository>['getInvoice']>>['invoice']>; documentId: string }) {
  const foldersRepository = createDocumentFoldersRepository({ db: routeContext.db });
  const { folder } = await foldersRepository.ensureContactFolder({ organizationId, contactId: invoice.customerId, contactName: invoice.customer!.name });
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

async function authorizeMember({ context, db, organizationId }: { context: Context; db: Database; organizationId: string }) {
  const { userId } = getUser({ context });
  await ensureUserIsInOrganization({ userId, organizationId, organizationsRepository: createOrganizationsRepository({ db }) });
}

function safeFileName(value: string) {
  return value.replace(/[^\w.-]+/g, '-');
}

// The customer receives the invoice from the issuing company, not from the platform: its name is the sender display name
// and replies go to its own address. The sending address stays the platform one, the only verified domain.
async function getInvoiceSender({ db, organizationId, fromEmail }: { db: Database; organizationId: string; fromEmail: string }) {
  const [{ profile }, { organization }] = await Promise.all([
    createInvoicingRepository({ db }).getFiscalProfile({ organizationId }),
    createOrganizationsRepository({ db }).getOrganizationById({ organizationId }),
  ]);

  const replyTo = profile?.email?.trim();

  return {
    sender: {
      from: formatSenderAddress({ fromEmail, displayName: [profile?.legalName, organization?.name].find(name => (name ?? '').trim() !== '') }),
      replyTo: replyTo === undefined || replyTo === '' ? undefined : replyTo,
    },
  };
}

function buildInvoiceEmail({ customerName, number, amountDueMinor, currency }: { customerName: string; number: string; amountDueMinor: number; currency: string }) {
  const safeName = escapeHtml(customerName);
  const safeNumber = escapeHtml(number);
  const total = new Intl.NumberFormat('en', { style: 'currency', currency }).format(amountDueMinor / 100);
  return `<p>Hello ${safeName},</p><p>Your invoice <strong>${safeNumber}</strong> for <strong>${escapeHtml(total)}</strong> is attached.</p><p>Thank you.</p>`;
}

function escapeHtml(value: string) {
  return value.replace(/[&<>'"]/g, character => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '\'': '&#39;', '"': '&quot;' })[character]!);
}
