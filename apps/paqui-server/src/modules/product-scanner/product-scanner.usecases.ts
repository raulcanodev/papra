import type { FilePart, ImagePart, TextPart, UserContent } from 'ai';
import type { z } from 'zod';
import type { Database } from '../app/database/database.types';
import type { Config } from '../config/config.types';
import type { CreatePropertyDefinition } from '../custom-properties/definitions/custom-property-definition.registry';
import type { DocumentStorageService } from '../documents/storage/documents.storage.services';
import type { CatalogReading, ProductCatalogImport, ScannerPropertyDefinition } from './product-scanner.models';
import { generateObject } from 'ai';
import { getAiModel } from '../ai-assistant/ai-assistant.providers';
import { formatDocumentContentForModel } from '../ai-assistant/attachments/attachments.models';
import { getOrganizationDocuments, loadDocumentFile, readDocumentForAssistant } from '../ai-assistant/attachments/attachments.usecases';
import { AI_FEATURES } from '../ai-usage/ai-usage.constants';
import { createContactNotFoundError } from '../contacts/contacts.errors';
import { createContactsRepository } from '../contacts/contacts.repository';
import { CUSTOM_PROPERTY_ENTITY_TYPES } from '../custom-properties/custom-properties.constants';
import { createCustomPropertyDefinitionNotFoundError } from '../custom-properties/custom-properties.errors';
import { createCustomPropertiesRepository } from '../custom-properties/custom-properties.repository';
import { generatePropertyKey } from '../custom-properties/custom-properties.repository.models';
import { createPropertyDefinition } from '../custom-properties/custom-properties.usecases';
import { saveEntityWithCustomProperties } from '../custom-properties/entity-custom-properties.usecases';
import { createCustomPropertiesOptionsRepository } from '../custom-properties/options/custom-properties-options.repository';
import { createDocumentNotFoundError } from '../documents/documents.errors';
import { createInvoicingRepository } from '../invoicing/invoicing.repository';
import { isCustomError } from '../shared/errors/errors';
import { MAX_SCANNED_TABLE_ROWS, MAX_SCANNED_TEXT_CHARS } from './product-scanner.constants';
import { createProductCatalogScanFailedError, createProductCatalogUnreadableError } from './product-scanner.errors';
import { buildCatalogReadingSchema, getCatalogReadingInstructions, toEntityCustomProperties, toScanProposal } from './product-scanner.models';

// Scanned PDFs have no text layer: they go to the model as files, which reads the pages
const MAX_PDF_FILE_BYTES = 10 * 1024 * 1024;

export type CatalogReader = (args: { system: string; schema: z.ZodType; content: UserContent }) => Promise<CatalogReading>;

export function createAiCatalogReader({ config, db, organizationId }: { config: Config; db: Database; organizationId: string }): CatalogReader {
  return async ({ system, schema, content }) => {
    const result = await generateObject({
      model: getAiModel({ config, db, feature: AI_FEATURES.PRODUCT_CATALOG_SCAN, organizationId }),
      schema,
      system,
      messages: [{ role: 'user', content }],
    });

    // The schema is built for each scan, its shape is CatalogReading
    return result.object as CatalogReading;
  };
}

async function getContactOrThrow({ db, organizationId, contactId }: { db: Database; organizationId: string; contactId: string }) {
  const { contact } = await createContactsRepository({ db }).getContact({ organizationId, contactId });

  if (!contact || contact.archivedAt !== null) {
    throw createContactNotFoundError();
  }

  return { contact };
}

async function getProductDefinitions({ db, organizationId }: { db: Database; organizationId: string }) {
  const { propertyDefinitions } = await createCustomPropertiesRepository({ db }).getOrganizationPropertyDefinitions({ organizationId, entityTypes: [CUSTOM_PROPERTY_ENTITY_TYPES.PRODUCT] });

  return {
    definitions: propertyDefinitions.map((definition): ScannerPropertyDefinition => ({
      id: definition.id,
      key: definition.key,
      name: definition.name,
      description: definition.description,
      type: definition.type,
      options: definition.options.map(option => ({ id: option.id, name: option.name })),
    })),
  };
}

// Reads the files the user uploaded (photos of the pages, PDF, spreadsheets) and proposes the products of the supplier,
// filling the product fields the organization already has. Nothing is saved: the user reviews the proposal first.
export async function scanProductCatalog({
  db,
  config,
  documentsStorageService,
  organizationId,
  contactId,
  documentIds,
  readCatalog = createAiCatalogReader({ config, db, organizationId }),
}: {
  db: Database;
  config: Config;
  documentsStorageService: DocumentStorageService;
  organizationId: string;
  contactId: string;
  documentIds: string[];
  readCatalog?: CatalogReader;
}) {
  const { contact } = await getContactOrThrow({ db, organizationId, contactId });
  const { documents } = await getOrganizationDocuments({ db, organizationId, documentIds });

  if (documents.length === 0) {
    throw createDocumentNotFoundError();
  }

  const files = await Promise.all(documents.map(async (document) => {
    const reading = await readDocumentForAssistant({ document, documentsStorageService, config, maxRows: MAX_SCANNED_TABLE_ROWS, maxChars: MAX_SCANNED_TEXT_CHARS });
    const isScannedPdf = reading.content.kind === 'unreadable' && document.mimeType === 'application/pdf' && document.originalSize <= MAX_PDF_FILE_BYTES;
    const pdf = isScannedPdf ? await loadDocumentFile({ document, documentsStorageService }).catch(() => undefined) : undefined;

    return { reading, pdf };
  }));

  const readableFiles = files.filter(({ reading, pdf }) => reading.content.kind !== 'unreadable' || pdf !== undefined);

  if (readableFiles.length === 0) {
    throw createProductCatalogUnreadableError();
  }

  const { definitions } = await getProductDefinitions({ db, organizationId });
  const { products } = await createInvoicingRepository({ db }).listProducts({ organizationId, contactId });
  const existingProducts = products.map(product => ({ id: product.id, name: product.name }));

  const content: UserContent = [
    { type: 'text', text: `Catalog of the supplier "${contact.name}".` },
    ...readableFiles.flatMap(({ reading, pdf }): Array<TextPart | ImagePart | FilePart> => pdf !== undefined
      ? [{ type: 'text', text: `[File "${reading.document.name}", scanned PDF attached below]` }, { type: 'file', data: pdf, mediaType: 'application/pdf' }]
      : [
          { type: 'text', text: formatDocumentContentForModel(reading) },
          ...(reading.image ? [{ type: 'image' as const, image: reading.image.data, mediaType: reading.image.mediaType }] : []),
        ]),
  ];

  const reading = await readCatalog({
    system: getCatalogReadingInstructions({ definitions, existingProducts }),
    schema: buildCatalogReadingSchema({ definitions, existingProducts }),
    content,
  }).catch((error: unknown) => {
    // "AI not configured" and the like keep their own message
    throw isCustomError(error) ? error : createProductCatalogScanFailedError({ cause: error });
  });

  const proposal = toScanProposal({ reading, definitions, existingProducts });
  const unreadableFiles = files.filter(file => !readableFiles.includes(file)).map(({ reading }) => reading.document.name);

  return { ...proposal, unreadableFiles };
}

// Saves what the user confirmed, all or nothing: the new fields first (an existing field with the same key is used
// instead, never duplicated), then the products of the supplier with their values
export async function importProductCatalog({
  db,
  config,
  organizationId,
  contactId,
  input,
}: {
  db: Database;
  config: Config;
  organizationId: string;
  contactId: string;
  input: ProductCatalogImport;
}) {
  await getContactOrThrow({ db, organizationId, contactId });

  return db.transaction(async (transaction) => {
    const tx = transaction as unknown as Database;
    const customPropertiesRepository = createCustomPropertiesRepository({ db: tx });
    const customPropertiesOptionsRepository = createCustomPropertiesOptionsRepository({ db: tx });
    const invoicingRepository = createInvoicingRepository({ db: tx });

    const { definitions } = await getProductDefinitions({ db: tx, organizationId });
    const definitionsById = new Map(definitions.map(definition => [definition.id, definition]));
    const definitionIdsByKey = new Map(definitions.map(definition => [definition.key, definition.id]));
    const definitionIdByRef = new Map(definitions.map(definition => [definition.id, definition.id]));
    let createdFieldsCount = 0;

    for (const newField of input.newFields) {
      if (newField.existingPropertyDefinitionId !== undefined && newField.existingPropertyDefinitionId !== null) {
        if (!definitionsById.has(newField.existingPropertyDefinitionId)) {
          throw createCustomPropertyDefinitionNotFoundError();
        }

        definitionIdByRef.set(newField.ref, newField.existingPropertyDefinitionId);
        continue;
      }

      const key = generatePropertyKey({ name: newField.name });
      const existingDefinitionId = definitionIdsByKey.get(key);

      if (existingDefinitionId !== undefined) {
        definitionIdByRef.set(newField.ref, existingDefinitionId);
        continue;
      }

      const { propertyDefinition } = await createPropertyDefinition({
        organizationId,
        definition: { name: newField.name, description: newField.description ?? null, type: newField.type, entityType: CUSTOM_PROPERTY_ENTITY_TYPES.PRODUCT } as CreatePropertyDefinition,
        config,
        customPropertiesRepository,
        customPropertiesOptionsRepository,
      });

      definitionIdsByKey.set(key, propertyDefinition.id);
      definitionIdByRef.set(newField.ref, propertyDefinition.id);
      createdFieldsCount += 1;
    }

    const { products: supplierProducts } = await invoicingRepository.listProducts({ organizationId, contactId });
    const supplierProductsById = new Map(supplierProducts.map(product => [product.id, product]));
    let createdCount = 0;
    let updatedCount = 0;

    for (const { matchesProductId, values, taxRateBps, ...fields } of input.products) {
      const existing = matchesProductId === null ? undefined : supplierProductsById.get(matchesProductId);

      await saveEntityWithCustomProperties({
        db: tx,
        organizationId,
        entityTypes: [CUSTOM_PROPERTY_ENTITY_TYPES.PRODUCT],
        customProperties: toEntityCustomProperties({ values, definitionIdByRef }),
        persistEntity: async ({ db: entityDb }) => {
          const repository = createInvoicingRepository({ db: entityDb });

          if (existing) {
            const product = { ...fields, contactId, taxRateBps: taxRateBps ?? existing.taxRateBps, icon: existing.icon, iconColor: existing.iconColor, imageDocumentId: existing.imageDocumentId };
            return (await repository.updateProduct({ organizationId, productId: existing.id, product })).product;
          }

          return (await repository.createProduct({ organizationId, product: { ...fields, contactId, taxRateBps: taxRateBps ?? 2_100 } })).product;
        },
      });

      if (existing) {
        updatedCount += 1;
      } else {
        createdCount += 1;
      }
    }

    return { createdCount, updatedCount, createdFieldsCount };
  });
}
