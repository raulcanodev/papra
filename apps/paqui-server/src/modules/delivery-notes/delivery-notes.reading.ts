import type { Buffer } from 'node:buffer';
import type { Database } from '../app/database/database.types';
import type { Config } from '../config/config.types';
import type { DocumentStorageService } from '../documents/storage/documents.storage.services';
import { generateObject } from 'ai';
import { z } from 'zod';
import { getAiModel } from '../ai-assistant/ai-assistant.providers';
import { getOrganizationDocuments, loadDocumentFile } from '../ai-assistant/attachments/attachments.usecases';
import { AI_FEATURES } from '../ai-usage/ai-usage.constants';
import { createContactsRepository } from '../contacts/contacts.repository';
import { createDocumentNotFoundError } from '../documents/documents.errors';
import { createInvoicingRepository } from '../invoicing/invoicing.repository';
import { EXTRACTABLE_DOCUMENT_MIME_TYPES, MAX_EXTRACTABLE_DOCUMENT_SIZE_BYTES } from '../purchases/purchases.constants';
import { resolveSupplier } from '../purchases/purchases.extraction.models';
import { isCustomError } from '../shared/errors/errors';
import { MAX_LINE_ALTERNATIVES, MAX_READING_ALIASES, MAX_READING_CATALOG_PRODUCTS } from './delivery-notes.constants';
import { createDeliveryNoteReadingFailedError, createDeliveryNoteUnreadableError } from './delivery-notes.errors';
import { buildWrittenTextAliases, normalizeWrittenText } from './delivery-notes.models';
import { createDeliveryNotesRepository } from './delivery-notes.repository';

export const deliveryNoteReadingSchema = z.object({
  customer: z.object({
    name: z.string().nullable().describe('Who receives the goods, as written; null when not on the paper'),
    taxId: z.string().nullable(),
  }),
  number: z.string().nullable().describe('The number of the delivery note, usually printed on the pad'),
  date: z.string().nullable().describe('YYYY-MM-DD'),
  lines: z.array(z.object({
    writtenText: z.string().describe('The line exactly as written, abbreviations included'),
    quantity: z.number().describe('The quantity written on the line, 1 when none'),
    productRef: z.string().nullable().describe('The ref of the catalog product it stands for, null when none fits'),
    alternativeRefs: z.array(z.string()).describe(`Up to ${MAX_LINE_ALTERNATIVES} other refs it could be, when unsure`),
    confidence: z.enum(['high', 'medium', 'low']),
  })),
  warnings: z.array(z.string()).describe('What the reviewer should double check: an illegible line, a crossed out quantity...'),
});

export type DeliveryNoteReading = z.infer<typeof deliveryNoteReadingSchema>;

export type DeliveryNoteReader = (input: { system: string; prompt: string; file: { data: Buffer; mediaType: string } }) => Promise<DeliveryNoteReading>;

const READER_INSTRUCTIONS = `You read delivery notes (albaranes) that a business hands to its customers with the goods, for an invoicing app.
They are phone photos of a paper pad, often a carbon copy, mostly handwritten with a pen: products and quantities, sometimes the customer, a date and prices.
Read every product line, never invent one. Keep what is written as is in writtenText, with its abbreviations ("3 caj tom pera").
For each line, pick the catalog product it stands for by its ref, thinking of the usual abbreviations, plurals, sizes and spelling mistakes.
The past readings tell how this business writes its products: follow them. Leave productRef null rather than guessing a product that does not fit.
The customer is who receives the goods, never the business itself (the printed header of the pad).`;

type CatalogProduct = { id: string; name: string; unit: string; description: string | null };

export function getDeliveryNoteReadingPrompt({ products, aliases, organizationName }: { products: CatalogProduct[]; aliases: Map<string, string>; organizationName: string | null }) {
  const refs = new Map(products.map((product, index) => [product.id, `P${index + 1}`]));
  const catalog = products.map(product => `${refs.get(product.id)}: ${product.name}${product.unit !== 'unit' ? ` (${product.unit})` : ''}${product.description !== null && product.description !== '' ? ` — ${product.description.slice(0, 80)}` : ''}`);
  const learnt = [...aliases.entries()].filter(([, productId]) => refs.has(productId)).map(([text, productId]) => `"${text}" → ${refs.get(productId)}`);

  return {
    refs,
    prompt: [
      organizationName === null ? undefined : `The business that writes the delivery note: ${organizationName}.`,
      catalog.length > 0 ? `Catalog:\n${catalog.join('\n')}` : 'The catalog is empty: leave every productRef null.',
      learnt.length > 0 ? `Past readings, confirmed by the user:\n${learnt.join('\n')}` : undefined,
      'Read this delivery note.',
    ].filter(Boolean).join('\n\n'),
  };
}

export function createAiDeliveryNoteReader({ config, db, organizationId }: { config: Config; db: Database; organizationId: string }): DeliveryNoteReader {
  return async ({ system, prompt, file }) => {
    const { object } = await generateObject({
      model: getAiModel({ config, db, feature: AI_FEATURES.DELIVERY_NOTE_READING, organizationId }),
      schema: deliveryNoteReadingSchema,
      system,
      messages: [{ role: 'user', content: [{ type: 'text', text: prompt }, { type: 'file', data: file.data, mediaType: file.mediaType }] }],
    });

    return object;
  };
}

function toDate(value: string | null) {
  const date = value === null ? null : new Date(`${value.slice(0, 10)}T00:00:00.000Z`);

  return date === null || Number.isNaN(date.getTime()) ? null : date;
}

// What the review screen starts from: the lines with the product the past readings or the model chose for them.
// A text confirmed before wins over the model: the user already said which product it is.
export function toDeliveryNoteProposal({ reading, refs, aliases }: { reading: DeliveryNoteReading; refs: Map<string, string>; aliases: Map<string, string> }) {
  const productIdsByRef = new Map([...refs.entries()].map(([productId, ref]) => [ref, productId]));
  const toProductId = (ref: string | null) => (ref === null ? null : productIdsByRef.get(ref.trim().toUpperCase()) ?? null);

  return {
    number: reading.number === null || reading.number.trim() === '' ? null : reading.number.trim(),
    date: toDate(reading.date),
    warnings: reading.warnings,
    lines: reading.lines
      .filter(line => line.writtenText.trim() !== '')
      .map((line) => {
        const remembered = aliases.get(normalizeWrittenText({ text: line.writtenText })) ?? null;
        const read = toProductId(line.productRef);
        const productId = remembered ?? read;

        return {
          writtenText: line.writtenText.trim(),
          quantityMillis: Math.max(1, Math.round((line.quantity > 0 ? line.quantity : 1) * 1_000)),
          productId,
          matchedBy: remembered !== null ? 'memory' as const : read !== null ? 'reading' as const : null,
          confidence: remembered !== null ? 'high' as const : line.confidence,
          alternativeProductIds: [...new Set([read, ...line.alternativeRefs.map(toProductId)])]
            .filter((id): id is string => id !== null && id !== productId)
            .slice(0, MAX_LINE_ALTERNATIVES),
        };
      }),
  };
}

// Reads the photo of a delivery note and proposes it prefilled: the customer, the products of the catalog and the
// quantities. Nothing is saved, the user reviews it first.
export async function readDeliveryNote({
  db,
  config,
  documentsStorageService,
  organizationId,
  documentId,
  readDeliveryNote: read = createAiDeliveryNoteReader({ config, db, organizationId }),
}: {
  db: Database;
  config: Config;
  documentsStorageService: DocumentStorageService;
  organizationId: string;
  documentId: string;
  readDeliveryNote?: DeliveryNoteReader;
}) {
  const { documents: [document] } = await getOrganizationDocuments({ db, organizationId, documentIds: [documentId] });

  if (!document) {
    throw createDocumentNotFoundError();
  }

  if (!(EXTRACTABLE_DOCUMENT_MIME_TYPES as readonly string[]).includes(document.mimeType) || document.originalSize > MAX_EXTRACTABLE_DOCUMENT_SIZE_BYTES) {
    throw createDeliveryNoteUnreadableError();
  }

  const deliveryNotesRepository = createDeliveryNotesRepository({ db });
  const [{ contacts }, { products }, { items }, { usage }, { profile }] = await Promise.all([
    createContactsRepository({ db }).listContacts({ organizationId }),
    createInvoicingRepository({ db }).listProducts({ organizationId }),
    deliveryNotesRepository.listWrittenTextItems({ organizationId, limit: MAX_READING_ALIASES }),
    deliveryNotesRepository.getProductUsage({ organizationId }),
    createInvoicingRepository({ db }).getFiscalProfile({ organizationId }),
  ]);

  // What is sold: our own catalog and the customers' own products, never what suppliers sell us
  const customerIds = new Set(contacts.filter(contact => contact.isCustomer).map(({ id }) => id));
  const catalog = products
    .filter(product => product.contactId === null || customerIds.has(product.contactId))
    .toSorted((a, b) => (usage.get(b.id) ?? 0) - (usage.get(a.id) ?? 0))
    .slice(0, MAX_READING_CATALOG_PRODUCTS);
  const aliases = buildWrittenTextAliases({ items });
  const { refs, prompt } = getDeliveryNoteReadingPrompt({ products: catalog, aliases, organizationName: profile?.legalName ?? null });

  const reading = await read({
    system: READER_INSTRUCTIONS,
    prompt,
    file: { data: await loadDocumentFile({ document, documentsStorageService }), mediaType: document.mimeType },
  }).catch((error: unknown) => {
    // "AI not configured" and the like keep their own message
    throw isCustomError(error) ? error : createDeliveryNoteReadingFailedError({ cause: error });
  });

  const proposal = toDeliveryNoteProposal({ reading, refs, aliases: new Map([...aliases].filter(([, productId]) => catalog.some(({ id }) => id === productId))) });
  const customer = resolveSupplier({ party: reading.customer, contacts: contacts.filter(contact => contact.isCustomer).map(contact => ({ ...contact, isSupplier: false })) });
  const { deliveryNote: duplicate } = proposal.number === null ? { deliveryNote: null } : await deliveryNotesRepository.findByNumber({ organizationId, number: proposal.number });

  return {
    documentId,
    ...proposal,
    customer: {
      name: reading.customer.name,
      taxId: reading.customer.taxId,
      contactId: customer.contactId,
      candidates: customer.candidates.map(({ contactId, name }) => ({ contactId, name })),
    },
    duplicate,
  };
}
