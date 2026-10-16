import type { CustomPropertyType } from '../custom-properties/custom-properties.types';

export type ProductScanFieldType = 'text' | 'number' | 'boolean';

export type ProductScanField = {
  /** The definition id of an existing field, "new:<key>" for a field to create */
  ref: string;
  status: 'existing' | 'new';
  name: string;
  type: CustomPropertyType;
  description: string | null;
  options: { id: string; name: string }[];
};

export type ProductScanProduct = {
  matchesProductId: string | null;
  name: string;
  description: string | null;
  unit: string;
  unitPriceMinor: number;
  currency: string;
  taxRateBps: number | null;
  /** Field ref to value (option ids for selects) */
  values: Record<string, unknown>;
};

export type ProductScanProposal = {
  fields: ProductScanField[];
  products: ProductScanProduct[];
  warnings: string[];
  unreadableFiles: string[];
};

export type ProductCatalogImportInput = {
  newFields: { ref: string; name: string; type: ProductScanFieldType; description: string | null; existingPropertyDefinitionId: string | null }[];
  products: ProductScanProduct[];
};

export type ProductCatalogImportResult = { createdCount: number; updatedCount: number; createdFieldsCount: number };
