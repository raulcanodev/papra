import type { Sheet } from '../ai-assistant/attachments/spreadsheet.parsers';
import type { Database } from '../app/database/database.types';
import type { Config } from '../config/config.types';
import type { DocumentStorageService } from '../documents/storage/documents.storage.services';
import type { DataImportEntity } from './data-imports.constants';
import type { ColumnMapping } from './data-imports.models';
import type { ConfirmContactsImportInput, ConfirmProductsImportInput } from './data-imports.schemas';
import { generateObject } from 'ai';
import { and, asc, eq, isNull } from 'drizzle-orm';
import { z } from 'zod';
import { getAiModel, isAiConfigured } from '../ai-assistant/ai-assistant.providers';
import { getDocumentReadingStrategy } from '../ai-assistant/attachments/attachments.models';
import { decodeText, getDocumentForAssistantOrThrow, loadDocumentFile } from '../ai-assistant/attachments/attachments.usecases';
import { parseCsv, parseXlsx } from '../ai-assistant/attachments/spreadsheet.parsers';
import { AI_FEATURES } from '../ai-usage/ai-usage.constants';
import { normalizeTaxId } from '../contacts/contacts.models';
import { createContactsRepository } from '../contacts/contacts.repository';
import { contactSchema } from '../contacts/contacts.schemas';
import { contactsTable } from '../contacts/contacts.table';
import { createInvoicingRepository } from '../invoicing/invoicing.repository';
import { productSchema } from '../invoicing/invoicing.schemas';
import { invoicingProductsTable } from '../invoicing/invoicing.tables';
import { formatSheetForModel, getColumnIndexFromLetter } from '../pricing/import/pricing-import.models';
import { createLogger } from '../shared/logger/logger';
import { DATA_IMPORT_FIELDS, MAX_DATA_IMPORT_FILE_BYTES, MAX_DATA_IMPORT_ROWS, MAX_MODEL_COLUMNS, MAX_MODEL_SAMPLE_ROWS } from './data-imports.constants';
import { createDataImportEmptyError, createDataImportUnreadableError } from './data-imports.errors';
import { findHeaderRow, getDataRows, hasNameColumn, mapColumnsWithRules, pickSheet, sanitizeMapping } from './data-imports.models';
import { getAiColumnMappingSchema } from './data-imports.schemas';

const logger = createLogger({ namespace: 'data-imports' });

export type ColumnMapper = (args: { entity: DataImportEntity; sheets: Sheet[] }) => Promise<{ sheetName: string; headerRow: number; mapping: ColumnMapping }>;

const FIELD_DESCRIPTIONS: Record<DataImportEntity, string> = {
  contacts: `The file lists the customers, suppliers or contacts of a company, one per row. The fields:
- name: the legal or trading name of the company or person (when there are both, the legal name)
- taxId: the tax identification number (NIF, CIF, DNI, NIE, VAT number...)
- email, phone: the main email address and phone number
- addressLine1: the street address; addressLine2: a second line of it
- postalCode, city, region (province, state), country
- bankAccount: the IBAN or bank account number for transfers
- paymentTermsDays: the number of days the customer has to pay
- notes: remarks about the contact`,
  products: `The file lists the products or services a company sells, one per row. The fields:
- name: the name of the product (often the short description); description: a longer description when there is also a name
- unit: the unit it is sold by (unit, kg, hour, box...)
- unitPrice: the selling price of one unit, before tax
- taxRate: the VAT or sales tax rate`,
};

export function createAiColumnMapper({ config, db, organizationId }: { config: Config; db: Database; organizationId: string }): ColumnMapper {
  return async ({ entity, sheets }) => {
    const fields = DATA_IMPORT_FIELDS[entity];
    const { object } = await generateObject({
      model: getAiModel({ config, db, feature: AI_FEATURES.DATA_IMPORT, organizationId }),
      schema: getAiColumnMappingSchema({ fields }),
      system: `You read the export of another business software and say which column holds what, so the application can import every row. You never copy values: the application reads them from the cells you point to.

${FIELD_DESCRIPTIONS[entity]}

Column names can be in any language and wording, abbreviated, or missing: use the values under them too (a column of 9 character codes like B12345678 is a tax id, of 5 digits a Spanish postal code). Give each field to one column at most, the one that fits it best, and ignore every other column (internal codes, balances, dates, totals). Give the sheet name, the row number of the header and the column letters exactly as shown.`,
      messages: [{ role: 'user', content: sheets.map(sheet => formatSheetForModel({ sheet, maxRows: findHeaderRow({ sheet }) + MAX_MODEL_SAMPLE_ROWS, maxColumns: MAX_MODEL_COLUMNS })).join('\n\n') }],
    });

    const columnCount = sheets.find(sheet => sheet.name === object.sheetName)?.rows[object.headerRow - 1]?.length ?? 0;
    const mapping: ColumnMapping = Array.from({ length: columnCount }, () => null);
    for (const { column, field } of object.columns) {
      const index = getColumnIndexFromLetter(column);
      if (field !== 'ignore' && index >= 0 && index < columnCount) {
        mapping[index] = field as ColumnMapping[number];
      }
    }

    return { sheetName: object.sheetName, headerRow: object.headerRow, mapping };
  };
}

async function readSheets({ db, documentsStorageService, organizationId, documentId }: { db: Database; documentsStorageService: DocumentStorageService; organizationId: string; documentId: string }) {
  const { document } = await getDocumentForAssistantOrThrow({ db, organizationId, documentId });
  const strategy = getDocumentReadingStrategy({ mimeType: document.mimeType, name: document.name });

  if ((strategy !== 'xlsx' && strategy !== 'csv') || document.originalSize > MAX_DATA_IMPORT_FILE_BYTES) {
    throw createDataImportUnreadableError();
  }

  let sheets: Sheet[];
  try {
    const data = await loadDocumentFile({ document, documentsStorageService });
    sheets = strategy === 'xlsx' ? await parseXlsx({ data }) : parseCsv({ text: decodeText({ data }) });
  } catch (error) {
    logger.warn({ error, documentId }, 'Data import file could not be read');
    throw createDataImportUnreadableError();
  }

  const nonEmptySheets = sheets.filter(sheet => sheet.rows.length > 1);
  if (nonEmptySheets.length === 0) {
    throw createDataImportEmptyError();
  }

  return { document, sheets: nonEmptySheets };
}

async function listExisting({ db, organizationId, entity }: { db: Database; organizationId: string; entity: DataImportEntity }) {
  if (entity === 'contacts') {
    const rows = await db.select({ id: contactsTable.id, name: contactsTable.name, taxId: contactsTable.taxId })
      .from(contactsTable)
      .where(and(eq(contactsTable.organizationId, organizationId), isNull(contactsTable.archivedAt)))
      .orderBy(asc(contactsTable.name));
    return rows.map(row => ({ id: row.id, name: row.name, taxId: normalizeTaxId({ taxId: row.taxId }) }));
  }

  const rows = await db.select({ id: invoicingProductsTable.id, name: invoicingProductsTable.name })
    .from(invoicingProductsTable)
    .where(and(eq(invoicingProductsTable.organizationId, organizationId), isNull(invoicingProductsTable.contactId), isNull(invoicingProductsTable.archivedAt)))
    .orderBy(asc(invoicingProductsTable.name));
  return rows.map(row => ({ id: row.id, name: row.name, taxId: null }));
}

// Reads the export and proposes which column fills which field: every row is sent back for the user to review, nothing
// is saved until they confirm
export async function analyzeDataImport({
  db,
  config,
  documentsStorageService,
  organizationId,
  documentId,
  entity,
  sheetName,
  mapColumns = isAiConfigured({ config }) ? createAiColumnMapper({ config, db, organizationId }) : undefined,
}: {
  db: Database;
  config: Config;
  documentsStorageService: DocumentStorageService;
  organizationId: string;
  documentId: string;
  entity: DataImportEntity;
  sheetName?: string;
  mapColumns?: ColumnMapper;
}) {
  const { document, sheets } = await readSheets({ db, documentsStorageService, organizationId, documentId });
  const warnings: Array<'ai_failed' | 'ai_not_configured' | 'rows_truncated'> = [];
  const pickedSheet = sheets.find(sheet => sheet.name === sheetName);

  // The model reads the header whatever its wording; the rules only know the usual names, in case it is not there
  let detected: { sheet: Sheet; headerRow: number; mapping: ColumnMapping } | undefined;
  if (mapColumns) {
    try {
      const answer = await mapColumns({ entity, sheets: pickedSheet ? [pickedSheet] : sheets });
      const sheet = pickedSheet ?? sheets.find(candidate => candidate.name === answer.sheetName) ?? pickSheet({ sheets })!;
      const headerRow = answer.headerRow >= 1 && answer.headerRow <= sheet.rows.length ? answer.headerRow : findHeaderRow({ sheet });
      const mapping = sanitizeMapping({ entity, mapping: answer.mapping, columnCount: sheet.rows[headerRow - 1]?.length ?? 0 });
      detected = hasNameColumn({ mapping }) ? { sheet, headerRow, mapping } : undefined;
    } catch (error) {
      logger.warn({ error, documentId }, 'Data import columns could not be mapped by the model');
      warnings.push('ai_failed');
    }
  } else {
    warnings.push('ai_not_configured');
  }

  const detectedWith = detected ? 'ai' : 'rules';
  if (!detected) {
    const sheet = pickedSheet ?? pickSheet({ sheets })!;
    const headerRow = findHeaderRow({ sheet });
    detected = { sheet, headerRow, mapping: mapColumnsWithRules({ entity, headers: sheet.rows[headerRow - 1] ?? [] }) };
  }

  const { rows, isTruncated } = getDataRows({ sheet: detected.sheet, headerRow: detected.headerRow, maxRows: MAX_DATA_IMPORT_ROWS });
  if (isTruncated) {
    warnings.push('rows_truncated');
  }

  return {
    entity,
    fileName: document.name,
    detectedWith,
    warnings,
    sheets: sheets.map(sheet => ({ name: sheet.name, rowCount: sheet.rows.length })),
    sheetName: detected.sheet.name,
    headerRow: detected.headerRow,
    headers: detected.sheet.rows[detected.headerRow - 1] ?? [],
    rows,
    mapping: detected.mapping,
    existing: await listExisting({ db, organizationId, entity }),
  };
}

const isValidEmail = (email: string) => z.string().email().safeParse(email).success;

// Fields left empty in the file keep what the contact already has: importing never erases data
const withoutEmpty = <T extends Record<string, unknown>>(record: T) => Object.fromEntries(Object.entries(record).filter(([, value]) => value !== null && value !== '')) as Partial<T>;

export async function confirmContactsImport({ db, organizationId, input }: { db: Database; organizationId: string; input: ConfirmContactsImportInput }) {
  return db.transaction(async (transaction) => {
    const tx = transaction as unknown as Database;
    const contactsRepository = createContactsRepository({ db: tx });
    let createdCount = 0;
    let updatedCount = 0;

    for (const { existingContactId, email, paymentTermsDays, ...contact } of input.contacts) {
      const fields = withoutEmpty({ ...contact, email: email !== null && isValidEmail(email) ? email : null, paymentTermsDays });

      const { contact: existing } = existingContactId === null ? { contact: null } : await contactsRepository.getContact({ organizationId, contactId: existingContactId });

      if (existing && existing.archivedAt === null) {
        await contactsRepository.updateContact({
          organizationId,
          contactId: existing.id,
          contact: contactSchema.parse({
            ...existing,
            ...fields,
            isCustomer: existing.isCustomer || input.roles.isCustomer,
            isSupplier: existing.isSupplier || input.roles.isSupplier,
            isSalesRepresentative: existing.isSalesRepresentative || input.roles.isSalesRepresentative,
          }),
        });
        updatedCount += 1;
        continue;
      }

      await contactsRepository.createContact({ organizationId, contact: contactSchema.parse({ ...fields, ...input.roles }) });
      createdCount += 1;
    }

    return { createdCount, updatedCount };
  });
}

export async function confirmProductsImport({ db, organizationId, input }: { db: Database; organizationId: string; input: ConfirmProductsImportInput }) {
  return db.transaction(async (transaction) => {
    const tx = transaction as unknown as Database;
    const invoicingRepository = createInvoicingRepository({ db: tx });
    let createdCount = 0;
    let updatedCount = 0;

    for (const { existingProductId, ...product } of input.products) {
      const fields = withoutEmpty(product);

      const [existing] = existingProductId === null
        ? []
        : await tx.select().from(invoicingProductsTable).where(and(eq(invoicingProductsTable.id, existingProductId), eq(invoicingProductsTable.organizationId, organizationId), isNull(invoicingProductsTable.archivedAt))).limit(1);

      if (existing) {
        await invoicingRepository.updateProduct({ organizationId, productId: existing.id, product: productSchema.parse({ ...existing, ...fields }) });
        updatedCount += 1;
        continue;
      }

      await invoicingRepository.createProduct({ organizationId, product: productSchema.parse({ unitPriceMinor: 0, ...fields }) });
      createdCount += 1;
    }

    return { createdCount, updatedCount };
  });
}
