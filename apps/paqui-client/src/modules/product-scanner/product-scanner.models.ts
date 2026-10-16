import type { ProductCatalogImportInput, ProductScanField, ProductScanFieldType, ProductScanProposal } from './product-scanner.types';

export const SCANNABLE_FILE_ACCEPT = 'image/*,application/pdf,.pdf,.xlsx,.xlsm,.csv,.tsv,.ods,text/csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,application/vnd.oasis.opendocument.spreadsheet';
export const MAX_SCANNED_FILES = 10;

export function formatScanFieldValue({ field, value, labels }: { field: ProductScanField; value: unknown; labels: { yes: string; no: string } }) {
  const optionName = (id: unknown) => field.options.find(option => option.id === id)?.name ?? String(id);

  if (field.type === 'select') {
    return optionName(value);
  }

  if (field.type === 'multi_select') {
    return (Array.isArray(value) ? value : []).map(optionName).join(', ');
  }

  if (field.type === 'boolean') {
    return value === true ? labels.yes : labels.no;
  }

  return String(value);
}

// What gets saved: the selected products only, and the new fields some of them use, each created or stored in the
// existing field the user picked
export function buildCatalogImportInput({ proposal, selectedIndexes, fieldTargets }: {
  proposal: ProductScanProposal;
  selectedIndexes: ReadonlySet<number>;
  /** New field ref to the existing definition id the user chose for it, absent to create it */
  fieldTargets: Readonly<Record<string, string>>;
}): ProductCatalogImportInput {
  const products = proposal.products.filter((_, index) => selectedIndexes.has(index));
  const usedRefs = new Set(products.flatMap(product => Object.keys(product.values)));

  return {
    newFields: proposal.fields
      .filter(field => field.status === 'new' && usedRefs.has(field.ref))
      .map(field => ({ ref: field.ref, name: field.name, type: field.type as ProductScanFieldType, description: field.description, existingPropertyDefinitionId: fieldTargets[field.ref] ?? null })),
    products,
  };
}
