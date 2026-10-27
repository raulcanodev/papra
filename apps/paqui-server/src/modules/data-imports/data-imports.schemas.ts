import { z } from 'zod';
import { DATA_IMPORT_ENTITIES, MAX_DATA_IMPORT_ROWS } from './data-imports.constants';

const idSchema = z.string().trim().min(1).max(64);
const optionalText = (max: number) => z.string().trim().max(max).nullable();

export const analyzeDataImportSchema = z.object({
  documentId: idSchema,
  entity: z.enum(DATA_IMPORT_ENTITIES),
  // The sheet the user picked; by default the largest one
  sheetName: z.string().trim().min(1).max(200).optional(),
});

// What the model answers: where the header is and which field each column fills. It never copies values, the app reads them from the cells.
export function getAiColumnMappingSchema({ fields }: { fields: readonly string[] }) {
  return z.object({
    sheetName: z.string().describe('Name of the sheet holding the records'),
    headerRow: z.number().int().describe('Row number of the header naming the columns'),
    columns: z.array(z.object({
      column: z.string().describe('Column letter, as shown'),
      field: z.enum(['ignore', ...fields]),
    })).describe('Every column of the header with the field it fills, or ignore'),
  });
}

export type AiColumnMapping = z.infer<ReturnType<typeof getAiColumnMappingSchema>>;

export const confirmContactsImportSchema = z.object({
  // The roles every imported contact gets (added to the ones an existing contact already has)
  roles: z.object({ isCustomer: z.boolean(), isSupplier: z.boolean(), isSalesRepresentative: z.boolean() }),
  contacts: z.array(z.object({
    // An existing contact of the organization to complete, null to create it
    existingContactId: idSchema.nullable(),
    kind: z.enum(['company', 'person']),
    name: z.string().trim().min(1).max(200),
    taxId: optionalText(500),
    // Checked again on the server: an invalid address is left out rather than failing the whole import
    email: optionalText(320),
    phone: optionalText(500),
    addressLine1: optionalText(500),
    addressLine2: optionalText(500),
    postalCode: optionalText(500),
    city: optionalText(500),
    region: optionalText(500),
    country: optionalText(500),
    bankAccount: optionalText(500),
    paymentTermsDays: z.number().int().min(0).max(365).nullable(),
    notes: optionalText(5_000),
  })).min(1).max(MAX_DATA_IMPORT_ROWS),
});

export type ConfirmContactsImportInput = z.infer<typeof confirmContactsImportSchema>;

export const confirmProductsImportSchema = z.object({
  products: z.array(z.object({
    // An existing product of the catalog to complete, null to create it
    existingProductId: idSchema.nullable(),
    name: z.string().trim().min(1).max(200),
    description: optionalText(1_000),
    unit: z.string().trim().min(1).max(40).nullable(),
    unitPriceMinor: z.number().int().min(0).max(1_000_000_000).nullable(),
    taxRateBps: z.number().int().min(0).max(10_000).nullable(),
  })).min(1).max(MAX_DATA_IMPORT_ROWS),
});

export type ConfirmProductsImportInput = z.infer<typeof confirmProductsImportSchema>;
