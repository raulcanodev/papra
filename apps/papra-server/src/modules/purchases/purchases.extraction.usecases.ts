import type { Database } from '../app/database/database.types';
import type { Config } from '../config/config.types';
import type { DocumentStorageService } from '../documents/storage/documents.storage.services';
import type { InvoiceExtraction } from './purchases.extraction.models';
import { Buffer } from 'node:buffer';
import { generateObject } from 'ai';
import { and, eq } from 'drizzle-orm';
import { getConfiguredLlmModel } from '../ai-assistant/ai-assistant.providers';
import { normalizeTaxId } from '../contacts/contacts.models';
import { createContactsRepository } from '../contacts/contacts.repository';
import { createDocumentNotFoundError } from '../documents/documents.errors';
import { extractDocumentText } from '../documents/documents.services';
import { documentsTable } from '../documents/documents.table';
import { invoicingProfilesTable } from '../invoicing/invoicing.tables';
import { collectStreamToFile } from '../shared/streams/stream.convertion';
import { EXTRACTABLE_DOCUMENT_MIME_TYPES, MAX_EXTRACTABLE_DOCUMENT_SIZE_BYTES } from './purchases.constants';
import { createPurchaseDocumentNotExtractableError, createPurchaseExtractionFailedError } from './purchases.errors';
import { getInvoiceDirection, invoiceExtractionSchema, toPurchaseInvoiceDraft } from './purchases.extraction.models';

// Reads an invoice from its text when available (any provider, cheaper), from the file itself otherwise (scans)
export type InvoiceReader = (args: { text: string } | { file: { data: Buffer; mediaType: string } }) => Promise<InvoiceExtraction>;

const READER_INSTRUCTIONS = `You read Spanish and European invoices for an accounting app.
Extract exactly what is printed, never invent values: use null (or 0 for rates) when something is not on the invoice.
Amounts are decimals in the invoice currency. Unit prices are before VAT and before discounts.
The issuer is who sends and charges the invoice, the recipient is who has to pay it.`;

export function createAiInvoiceReader({ config }: { config: Config }): InvoiceReader {
  return async (input) => {
    const model = getConfiguredLlmModel({ config });

    const { object } = await generateObject({
      model,
      schema: invoiceExtractionSchema,
      system: READER_INSTRUCTIONS,
      messages: [{
        role: 'user',
        content: 'text' in input
          ? [{ type: 'text', text: `Invoice text:\n\n${input.text.slice(0, 40_000)}` }]
          : [{ type: 'text', text: 'Read this invoice.' }, { type: 'file', data: input.file.data, mediaType: input.file.mediaType }],
      }],
    });

    return object;
  };
}

export async function extractPurchaseInvoiceFromDocument({
  organizationId,
  documentId,
  db,
  config,
  documentsStorageService,
  readInvoice = createAiInvoiceReader({ config }),
}: {
  organizationId: string;
  documentId: string;
  db: Database;
  config: Config;
  documentsStorageService: DocumentStorageService;
  readInvoice?: InvoiceReader;
}) {
  const [document] = await db
    .select()
    .from(documentsTable)
    .where(and(eq(documentsTable.id, documentId), eq(documentsTable.organizationId, organizationId), eq(documentsTable.isDeleted, false)))
    .limit(1);

  if (!document) {
    throw createDocumentNotFoundError();
  }

  if (!(EXTRACTABLE_DOCUMENT_MIME_TYPES as readonly string[]).includes(document.mimeType) || document.originalSize > MAX_EXTRACTABLE_DOCUMENT_SIZE_BYTES) {
    throw createPurchaseDocumentNotExtractableError();
  }

  const loadFile = async () => {
    const { fileStream } = await documentsStorageService.getFileStream({
      storageKey: document.originalStorageKey,
      fileEncryptionAlgorithm: document.fileEncryptionAlgorithm,
      fileEncryptionKekVersion: document.fileEncryptionKekVersion,
      fileEncryptionKeyWrapped: document.fileEncryptionKeyWrapped,
    });

    return collectStreamToFile({ fileStream, fileName: document.name, mimeType: document.mimeType });
  };

  // The content is extracted in the background after an upload: right after it, read the text now instead of waiting
  let text = document.content.trim();
  let file: File | undefined;

  if (text === '') {
    ({ file } = await loadFile());
    text = (await extractDocumentText({ file, ocrLanguages: config.documents.ocrLanguages })).text.trim();
  }

  const extraction = await readInvoice(text !== ''
    ? { text }
    : { file: { data: Buffer.from(await (file ?? (await loadFile()).file).arrayBuffer()), mediaType: document.mimeType } },
  ).catch((error: unknown) => {
    throw createPurchaseExtractionFailedError({ cause: error });
  });

  const [profile] = await db.select({ taxId: invoicingProfilesTable.taxId }).from(invoicingProfilesTable).where(eq(invoicingProfilesTable.organizationId, organizationId)).limit(1);
  const direction = getInvoiceDirection({ extraction, organizationTaxId: profile?.taxId });

  // The counterparty of the organization: the issuer of a received invoice is the supplier
  const counterparty = direction === 'issued' ? extraction.recipient : extraction.issuer;
  const counterpartyTaxId = normalizeTaxId({ taxId: counterparty.taxId });
  const { contacts } = await createContactsRepository({ db }).listContacts({ organizationId });
  const matchedContact = counterpartyTaxId === null ? undefined : contacts.find(contact => normalizeTaxId({ taxId: contact.taxId }) === counterpartyTaxId);

  return {
    direction,
    draft: toPurchaseInvoiceDraft({ extraction, supplierId: matchedContact?.isSupplier === true ? matchedContact.id : null, documentId }),
    // Shown to the user: an existing contact to use (adding it the supplier role if needed), or the data to create one
    counterparty: {
      contactId: matchedContact?.id ?? null,
      hasSupplierRole: matchedContact?.isSupplier ?? false,
      ...counterparty,
    },
    // Lets the review screen warn when the lines do not add up to the printed total
    printedTotal: Math.round(extraction.total * 100),
  };
}
