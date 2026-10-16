import type { RouteDefinitionContext } from '../../../app/server.types';
import type { PdfInvoice } from '../../../invoicing/invoicing.pdf';
import { z } from 'zod';
import { requireAuthentication } from '../../../app/auth/auth.middleware';
import { getUser } from '../../../app/auth/auth.models';
import { createInvoiceNotFoundError } from '../../../invoicing/invoicing.errors';
import { renderInvoicePdf } from '../../../invoicing/invoicing.pdf';
import { createInvoicingRepository } from '../../../invoicing/invoicing.repository';
import { createVerifactuRepository } from '../../../invoicing/verifactu.repository';
import { legacyValidateParams } from '../../../shared/validation/validation.legacy';
import { GESTORIA_MODULES } from '../../gestorias.constants';
import { createGestoriasRepository, GESTORIA_HIDDEN_INVOICE_STATUSES } from '../../gestorias.repository';
import { gestoriaClientParamsSchema } from '../../gestorias.schemas';
import { ensureGestoriaCanReadClient } from '../../gestorias.usecases';

const invoiceParamsSchema = gestoriaClientParamsSchema.extend({ invoiceId: z.string().trim().min(1).max(64) });

// Invoices issued by a client company, as they are on its books: read only, drafts excluded
export function registerGestoriaInvoicesRoutes(context: RouteDefinitionContext) {
  setupListClientInvoicesRoute(context);
  setupGetClientInvoicePdfRoute(context);
}

function setupListClientInvoicesRoute({ app, db }: RouteDefinitionContext) {
  app.get(
    '/api/gestorias/:gestoriaId/clients/:organizationId/invoices',
    requireAuthentication(),
    legacyValidateParams(gestoriaClientParamsSchema),
    async (context) => {
      const { userId } = getUser({ context });
      const { gestoriaId, organizationId } = context.req.valid('param');

      await ensureGestoriaCanReadClient({ userId, gestoriaId, organizationId, module: GESTORIA_MODULES.INVOICES, gestoriasRepository: createGestoriasRepository({ db }) });

      const { invoices } = await createInvoicingRepository({ db }).listInvoices({ organizationId });

      return context.json({ invoices: invoices.filter(invoice => !GESTORIA_HIDDEN_INVOICE_STATUSES.includes(invoice.status)) });
    },
  );
}

function setupGetClientInvoicePdfRoute({ app, db }: RouteDefinitionContext) {
  app.get(
    '/api/gestorias/:gestoriaId/clients/:organizationId/invoices/:invoiceId/pdf',
    requireAuthentication(),
    legacyValidateParams(invoiceParamsSchema),
    async (context) => {
      const { userId } = getUser({ context });
      const { gestoriaId, organizationId, invoiceId } = context.req.valid('param');

      await ensureGestoriaCanReadClient({ userId, gestoriaId, organizationId, module: GESTORIA_MODULES.INVOICES, gestoriasRepository: createGestoriasRepository({ db }) });

      const { invoice } = await createInvoicingRepository({ db }).getInvoice({ organizationId, invoiceId });

      if (!invoice || GESTORIA_HIDDEN_INVOICE_STATUSES.includes(invoice.status)) {
        throw createInvoiceNotFoundError();
      }

      const { record } = await createVerifactuRepository({ db }).getRecordForInvoice({ organizationId, invoiceId });
      const pdf = await renderInvoicePdf({ ...invoice, verifactuQrUrl: record?.qrUrl ?? null } as PdfInvoice);
      const fileName = (invoice.number ?? invoice.id).replace(/[^\w.-]+/g, '-');

      return context.body(new Uint8Array(pdf), 200, {
        'Content-Type': 'application/pdf',
        'Content-Disposition': `attachment; filename="${fileName}.pdf"`,
        'Cache-Control': 'private, no-store',
      });
    },
  );
}
