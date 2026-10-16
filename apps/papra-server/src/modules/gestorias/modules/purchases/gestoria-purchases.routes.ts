import type { RouteDefinitionContext } from '../../../app/server.types';
import { Readable } from 'node:stream';
import { requireAuthentication } from '../../../app/auth/auth.middleware';
import { getUser } from '../../../app/auth/auth.models';
import { createDocumentNotFoundError } from '../../../documents/documents.errors';
import { createDocumentsRepository } from '../../../documents/documents.repository';
import { createPurchaseInvoiceNotFoundError } from '../../../purchases/purchases.errors';
import { createPurchasesRepository } from '../../../purchases/purchases.repository';
import { purchaseInvoiceIdSchema } from '../../../purchases/purchases.schemas';
import { legacyValidateParams } from '../../../shared/validation/validation.legacy';
import { GESTORIA_MODULES } from '../../gestorias.constants';
import { createGestoriasRepository } from '../../gestorias.repository';
import { gestoriaClientParamsSchema } from '../../gestorias.schemas';
import { ensureGestoriaCanReadClient } from '../../gestorias.usecases';

const purchaseInvoiceParamsSchema = gestoriaClientParamsSchema.extend({ purchaseInvoiceId: purchaseInvoiceIdSchema });

// Invoices received by a client company and the file of each one: read only
export function registerGestoriaPurchasesRoutes(context: RouteDefinitionContext) {
  setupListClientPurchasesRoute(context);
  setupGetClientPurchaseDocumentRoute(context);
}

function setupListClientPurchasesRoute({ app, db }: RouteDefinitionContext) {
  app.get(
    '/api/gestorias/:gestoriaId/clients/:organizationId/purchases',
    requireAuthentication(),
    legacyValidateParams(gestoriaClientParamsSchema),
    async (context) => {
      const { userId } = getUser({ context });
      const { gestoriaId, organizationId } = context.req.valid('param');

      await ensureGestoriaCanReadClient({ userId, gestoriaId, organizationId, module: GESTORIA_MODULES.PURCHASES, gestoriasRepository: createGestoriasRepository({ db }) });

      const { purchaseInvoices } = await createPurchasesRepository({ db }).listPurchaseInvoices({ organizationId });

      return context.json({ purchaseInvoices });
    },
  );
}

// Only the file attached to a received invoice: the gestoría never browses the other documents of the company
function setupGetClientPurchaseDocumentRoute({ app, db, documentsStorageService }: RouteDefinitionContext) {
  app.get(
    '/api/gestorias/:gestoriaId/clients/:organizationId/purchases/:purchaseInvoiceId/document',
    requireAuthentication(),
    legacyValidateParams(purchaseInvoiceParamsSchema),
    async (context) => {
      const { userId } = getUser({ context });
      const { gestoriaId, organizationId, purchaseInvoiceId } = context.req.valid('param');

      await ensureGestoriaCanReadClient({ userId, gestoriaId, organizationId, module: GESTORIA_MODULES.PURCHASES, gestoriasRepository: createGestoriasRepository({ db }) });

      const { purchaseInvoice } = await createPurchasesRepository({ db }).getPurchaseInvoice({ organizationId, purchaseInvoiceId });

      if (!purchaseInvoice) {
        throw createPurchaseInvoiceNotFoundError();
      }

      const { document } = purchaseInvoice.documentId !== null
        ? await createDocumentsRepository({ db }).getDocumentById({ documentId: purchaseInvoice.documentId, organizationId })
        : { document: undefined };

      if (!document || document.isDeleted) {
        throw createDocumentNotFoundError();
      }

      const { fileStream } = await documentsStorageService.getFileStream({
        storageKey: document.originalStorageKey,
        fileEncryptionAlgorithm: document.fileEncryptionAlgorithm,
        fileEncryptionKekVersion: document.fileEncryptionKekVersion,
        fileEncryptionKeyWrapped: document.fileEncryptionKeyWrapped,
      });

      return context.body(
        Readable.toWeb(fileStream),
        200,
        {
          // Same defenses as the document file route: never rendered by the browser, the client uses the blob API
          'Content-Type': 'application/octet-stream',
          'Content-Disposition': `attachment; filename*=UTF-8''${encodeURIComponent(document.name)}`,
          'Content-Length': String(document.originalSize),
          'X-Content-Type-Options': 'nosniff',
          'X-Frame-Options': 'DENY',
        },
      );
    },
  );
}
