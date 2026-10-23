export type DataImportEntity = 'contacts' | 'products';

export type DataImportWarning = 'ai_failed' | 'ai_not_configured' | 'rows_truncated';

export type DataImportProposal = {
  entity: DataImportEntity;
  fileName: string;
  detectedWith: 'ai' | 'rules';
  warnings: DataImportWarning[];
  sheets: Array<{ name: string; rowCount: number }>;
  sheetName: string;
  headerRow: number;
  headers: string[];
  rows: string[][];
  /** The field each column fills, by position; null leaves the column out */
  mapping: Array<string | null>;
  /** What the organization already has, to complete it instead of duplicating it */
  existing: Array<{ id: string; name: string; taxId: string | null }>;
};

export type ContactRoles = { isCustomer: boolean; isSupplier: boolean; isSalesRepresentative: boolean };

export type ImportedContact = {
  existingContactId: string | null;
  kind: 'company' | 'person';
  name: string;
  taxId: string | null;
  email: string | null;
  phone: string | null;
  addressLine1: string | null;
  addressLine2: string | null;
  postalCode: string | null;
  city: string | null;
  region: string | null;
  country: string | null;
  paymentTermsDays: number | null;
  notes: string | null;
};

export type ImportedProduct = {
  existingProductId: string | null;
  name: string;
  description: string | null;
  unit: string | null;
  unitPriceMinor: number | null;
  taxRateBps: number | null;
};

export type DataImportResult = { createdCount: number; updatedCount: number };
