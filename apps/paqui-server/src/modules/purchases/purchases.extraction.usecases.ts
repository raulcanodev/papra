import type { Database } from '../app/database/database.types';
import type { Config } from '../config/config.types';
import type { DocumentStorageService } from '../documents/storage/documents.storage.services';
import type { InvoiceExtraction } from './purchases.extraction.models';
import { Buffer } from 'node:buffer';
import { generateObject } from 'ai';
import { and, eq } from 'drizzle-orm';
import { getAiModel } from '../ai-assistant/ai-assistant.providers';
import { AI_FEATURES } from '../ai-usage/ai-usage.constants';
import { createContactsRepository } from '../contacts/contacts.repository';
import { createDocumentNotFoundError } from '../documents/documents.errors';
import { extractDocumentText } from '../documents/documents.services';
import { documentsTable } from '../documents/documents.table';
import { invoicingProfilesTable } from '../invoicing/invoicing.tables';
import { organizationsTable } from '../organizations/organizations.table';
import { collectStreamToFile } from '../shared/streams/stream.convertion';
import { EXTRACTABLE_DOCUMENT_MIME_TYPES, MAX_EXTRACTABLE_DOCUMENT_SIZE_BYTES } from './purchases.constants';
import { createPurchaseDocumentNotExtractableError, createPurchaseExtractionFailedError } from './purchases.errors';
import { getInvoiceDirection, INVOICE_EXTRACTION_SCHEMA_VERSION, invoiceExtractionSchema, normalizeReadParty, resolveSupplier, toPurchaseInvoiceDraft } from './purchases.extraction.models';

// Reads the paper from its text when it has a text layer (cheaper, any provider), from the file itself otherwise:
// a photo goes to the vision model, with the text already extracted from it (if any) as a hint
export type InvoiceReaderInput = {
  text?: string;
  file?: { data: Buffer; mediaType: string };
  // Who "we" are: lets the model tell the issuer from the recipient on a crumpled ticket
  organization: { name: string | null; taxId: string | null };
  // The language of the workspace (a BCP 47 locale): the notes for the reviewer are written in it
  locale?: string;
};

export type InvoiceReader = (input: InvoiceReaderInput) => Promise<InvoiceExtraction>;

const READER_INSTRUCTIONS = `You read invoices, tickets and delivery notes (albaranes), mostly Spanish and European, for an accounting app.
They come as PDF text or as phone photos that can be skewed, folded, blurry or partly handwritten.
Extract exactly what is printed, never invent values: use null (or 0 for rates and prices) when something is not on the paper.
Amounts are decimals in the document currency. Unit prices are before VAT and before discounts: when only VAT-included prices are printed (tickets), compute the price before VAT from the rate.
The issuer is who sends and charges the document (its header, logo, tax id), the recipient is who receives the goods or has to pay.
Read the payment terms when printed, in any wording: the payment method and every due date ("vencimiento 15/11", "a 30 días", "30/60/90 días", a table of instalments with their amounts).
Anything useful printed that has no dedicated field goes to metadata, with a short label, instead of being lost.
Report in warnings anything the reviewer should double check.`;

function getLanguageName({ locale }: { locale: string }) {
  try {
    return new Intl.DisplayNames(['en'], { type: 'language' }).of(locale.split('-')[0]!) ?? locale;
  } catch {
    return locale;
  }
}

function getReaderPrompt({ text, file, organization, locale }: InvoiceReaderInput) {
  const lines = [
    locale !== undefined ? `Write the warnings in ${getLanguageName({ locale })}, whatever the language of the document.` : undefined,
    organization.name !== null || organization.taxId !== null ? `We are ${[organization.name, organization.taxId].filter(Boolean).join(', ')}: we are usually the recipient.` : undefined,
    file ? 'Read this document.' : undefined,
    text !== undefined && text !== '' ? `${file ? 'Text recognized on it, may contain OCR mistakes' : 'Document text'}:\n\n${text.slice(0, 40_000)}` : undefined,
  ];

  return lines.filter(Boolean).join('\n\n');
}

export function createAiInvoiceReader({ config, db, organizationId }: { config: Config; db: Database; organizationId: string }): InvoiceReader {
  return async (input) => {
    const model = getAiModel({ config, db, feature: AI_FEATURES.PURCHASE_READING, organizationId });

    const { object } = await generateObject({
      model,
      schema: invoiceExtractionSchema,
      system: READER_INSTRUCTIONS,
      messages: [{
        role: 'user',
        content: [
          { type: 'text', text: getReaderPrompt(input) },
          ...(input.file ? [{ type: 'file' as const, data: input.file.data, mediaType: input.file.mediaType }] : []),
        ],
      }],
    });

    return { ...object, issuer: normalizeReadParty({ party: object.issuer }), recipient: normalizeReadParty({ party: object.recipient }) };
  };
}

export async function extractPurchaseInvoiceFromDocument({
  organizationId,
  documentId,
  db,
  config,
  documentsStorageService,
  readInvoice = createAiInvoiceReader({ config, db, organizationId }),
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

    const { file } = await collectStreamToFile({ fileStream, fileName: document.name, mimeType: document.mimeType });

    return file;
  };

  const [profile] = await db.select({ legalName: invoicingProfilesTable.legalName, taxId: invoicingProfilesTable.taxId, locale: invoicingProfilesTable.locale }).from(invoicingProfilesTable).where(eq(invoicingProfilesTable.organizationId, organizationId)).limit(1);
  // The legal name of the fiscal profile, or the name of the workspace while it has none
  const [workspace] = await db.select({ name: organizationsTable.name }).from(organizationsTable).where(eq(organizationsTable.id, organizationId)).limit(1);
  const organization = { name: profile?.legalName || workspace?.name || null, taxId: profile?.taxId ?? null };
  // Spanish while the workspace has no fiscal profile, as the profile itself defaults to
  const locale = profile?.locale ?? 'es-ES';
  const asReaderFile = async (file: File) => ({ data: Buffer.from(await file.arrayBuffer()), mediaType: document.mimeType });

  // The content is extracted in the background after an upload: right after it, a PDF text is read now instead of waiting
  const readerInput = await (async (): Promise<InvoiceReaderInput> => {
    const text = document.content.trim();

    if (isPhoto({ mimeType: document.mimeType })) {
      return { file: await asReaderFile(await loadFile()), text: text || undefined, organization, locale };
    }

    if (text !== '') {
      return { text, organization, locale };
    }

    const file = await loadFile();
    const extractedText = (await extractDocumentText({ file, ocrLanguages: config.documents.ocrLanguages })).text.trim();

    return extractedText !== '' ? { text: extractedText, organization, locale } : { file: await asReaderFile(file), organization, locale };
  })();

  const extraction = await readInvoice(readerInput).catch((error: unknown) => {
    throw createPurchaseExtractionFailedError({ cause: error });
  });

  const direction = getInvoiceDirection({ extraction, organizationTaxId: organization.taxId, organizationNames: [profile?.legalName, workspace?.name] });

  // The counterparty of the organization: the issuer of a received invoice is the supplier
  const counterparty = direction === 'issued' ? extraction.recipient : extraction.issuer;
  const { contacts } = await createContactsRepository({ db }).listContacts({ organizationId });
  const supplier = resolveSupplier({ party: counterparty, contacts });
  const matchedContact = supplier.status === 'matched' ? contacts.find(contact => contact.id === supplier.contactId) : undefined;

  // The bank account printed on the paper completes a known contact that has none, it never replaces one
  if (matchedContact && matchedContact.bankAccount === null && counterparty.bankAccount !== null) {
    await createContactsRepository({ db }).setMissingBankAccount({ organizationId, contactId: matchedContact.id, bankAccount: counterparty.bankAccount });
  }

  return {
    schemaVersion: INVOICE_EXTRACTION_SCHEMA_VERSION,
    direction,
    draft: toPurchaseInvoiceDraft({ extraction, supplierId: supplier.status === 'matched' && supplier.hasSupplierRole ? supplier.contactId : null, documentId, contactTermsDays: matchedContact?.paymentTermsDays ?? null }),
    // Shown to the user: the contact to use (adding it the supplier role if needed), similar ones, or the data to create one
    counterparty: { ...counterparty, ...supplier },
    // Both sides as read, for the screen to say who issued the paper and to switch sides when the direction is unknown
    issuer: extraction.issuer,
    recipient: extraction.recipient,
    warnings: extraction.warnings,
    // Lets the review screen warn when the lines do not add up to the printed total
    printedTotal: extraction.total === null ? null : Math.round(extraction.total * 100),
  };
}

function isPhoto({ mimeType }: { mimeType: string }) {
  return mimeType.startsWith('image/');
}
