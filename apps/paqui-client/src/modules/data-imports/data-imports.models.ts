import type { DataImportEntity, DataImportProposal, ImportedContact, ImportedProduct } from './data-imports.types';

// The fields a column can fill, in the order they are offered. Same list as the server.
export const DATA_IMPORT_FIELDS = {
  contacts: ['name', 'taxId', 'email', 'phone', 'addressLine1', 'addressLine2', 'postalCode', 'city', 'region', 'country', 'bankAccount', 'paymentTermsDays', 'notes'],
  products: ['name', 'description', 'unit', 'unitPrice', 'taxRate'],
} as const satisfies Record<DataImportEntity, readonly string[]>;

export const DATA_IMPORT_FILE_ACCEPT = '.xlsx,.xlsm,.csv,.tsv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,text/csv';

/** What happens to an existing contact or product found in the file */
export type ExistingPolicy = 'update' | 'skip';

export type RowIssue = 'missing_name' | 'duplicate_in_file' | 'invalid_email' | 'invalid_price' | 'invalid_tax_rate';

export type RowStatus = 'create' | 'update' | 'skip';

export type ImportRow<T> = {
  /** Position in the rows of the proposal */
  index: number;
  record: T;
  status: RowStatus;
  existingName: string | null;
  issues: RowIssue[];
};

// ----- Cells -----

/** "45.5", "1.234,56", "12,5 €", "1,234.56" -> number; null when it is not one */
export function parseCellNumber(text: string): number | null {
  const compact = text.trim().replace(/[\s€$£%]/g, '');

  if (compact === '' || !/^-?[\d.,]+$/.test(compact) || !/\d/.test(compact)) {
    return null;
  }

  const lastComma = compact.lastIndexOf(',');
  const lastDot = compact.lastIndexOf('.');
  const commaCount = compact.split(',').length - 1;
  const dotCount = compact.split('.').length - 1;

  // The last separator is the decimal one when both appear; a repeated one only groups thousands
  const decimalSeparator = lastComma !== -1 && lastDot !== -1
    ? (lastComma > lastDot ? ',' : '.')
    : commaCount === 1 ? ',' : dotCount === 1 ? '.' : null;

  const normalized = decimalSeparator === null
    ? compact.replace(/[.,]/g, '')
    : compact.replace(decimalSeparator === ',' ? /\./g : /,/g, '').replace(',', '.');

  const value = Number(normalized);

  return Number.isFinite(value) ? value : null;
}

/** "21", "21%", "21,00" or 0.21 (a percentage cell of a spreadsheet) -> 2100 basis points */
export function parseTaxRateBps(text: string): number | null {
  const value = parseCellNumber(text);
  if (value === null || value < 0) {
    return null;
  }
  const percent = value > 0 && value < 1 && !text.includes('%') ? value * 100 : value;

  return percent <= 100 ? Math.round(percent * 100) : null;
}

/** "30", "30 días", "a 30 dias" -> 30 */
export function parsePaymentTermsDays(text: string): number | null {
  const match = /\d+/.exec(text);
  const days = match ? Number(match[0]) : null;

  return days !== null && days <= 365 ? days : null;
}

// Same as the server: "ES B-1234 5678" and "B12345678" are the same tax id
export function normalizeTaxId(taxId: string | null) {
  const normalized = (taxId ?? '').toUpperCase().replace(/[^A-Z0-9]/g, '').replace(/^ES(?=[A-Z0-9]{9}$)/, '');

  return normalized === '' ? null : normalized;
}

/** A Spanish DNI or NIE belongs to a person; any other tax id (a CIF, a foreign VAT number) to a company */
export function getContactKind({ taxId }: { taxId: string | null }): 'company' | 'person' {
  const normalized = normalizeTaxId(taxId);

  return normalized !== null && /^(?:\d{8}|[XYZ]\d{7})[A-Z]$/.test(normalized) ? 'person' : 'company';
}

export const normalizeName = (name: string) => name.normalize('NFD').replace(/\p{M}/gu, '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();

const isValidEmail = (email: string) => /^[^\s@]+@[^\s@][^\s@.]*(?:\.[^\s@.]+)+$/.test(email);

// ----- Rows -----

function getCell({ row, mapping, field }: { row: string[]; mapping: Array<string | null>; field: string }) {
  const column = mapping.indexOf(field);
  const value = column === -1 ? '' : (row[column] ?? '').trim();

  return value === '' ? null : value;
}

function finishRow<T>({ index, record, name, duplicateKey, matchKeys, existingIndex, seenKeys, issues, existingPolicy }: {
  index: number;
  record: T;
  name: string | null;
  /** What makes two rows of the file the same record */
  duplicateKey: string | null;
  /** How an existing record is found, best first */
  matchKeys: string[];
  existingIndex: Map<string, { id: string; name: string }>;
  seenKeys: Set<string>;
  issues: RowIssue[];
  existingPolicy: ExistingPolicy;
}): ImportRow<T> & { existingId: string | null } {
  if (name === null) {
    return { index, record, status: 'skip', existingName: null, existingId: null, issues: ['missing_name', ...issues] };
  }

  // The same contact twice in the file: the first row is imported
  if (duplicateKey !== null && seenKeys.has(duplicateKey)) {
    return { index, record, status: 'skip', existingName: null, existingId: null, issues: ['duplicate_in_file', ...issues] };
  }
  if (duplicateKey !== null) {
    seenKeys.add(duplicateKey);
  }

  const existing = matchKeys.map(key => existingIndex.get(key)).find(Boolean) ?? null;

  return {
    index,
    record,
    status: existing ? (existingPolicy === 'update' ? 'update' : 'skip') : 'create',
    existingName: existing?.name ?? null,
    existingId: existing?.id ?? null,
    issues,
  };
}

// Matched by tax id first, then by name: an export spells a name the same way the app saved it from the previous import
function buildExistingIndex({ proposal }: { proposal: DataImportProposal }) {
  const index = new Map<string, { id: string; name: string }>();
  for (const existing of proposal.existing) {
    const taxId = normalizeTaxId(existing.taxId);
    if (taxId !== null && !index.has(`tax:${taxId}`)) {
      index.set(`tax:${taxId}`, existing);
    }
    const name = normalizeName(existing.name);
    if (name !== '' && !index.has(`name:${name}`)) {
      index.set(`name:${name}`, existing);
    }
    // A row with a tax id only joins a namesake that has none: two namesakes with different tax ids are two contacts
    if (name !== '' && taxId === null && !index.has(`untaxed:${name}`)) {
      index.set(`untaxed:${name}`, existing);
    }
  }
  return index;
}

export function buildContactRows({ proposal, mapping, existingPolicy }: { proposal: DataImportProposal; mapping: Array<string | null>; existingPolicy: ExistingPolicy }): ImportRow<ImportedContact>[] {
  const existingIndex = buildExistingIndex({ proposal });
  const seenKeys = new Set<string>();

  return proposal.rows.map((row, index) => {
    const cell = (field: string) => getCell({ row, mapping, field });
    const issues: RowIssue[] = [];

    const email = cell('email');
    if (email !== null && !isValidEmail(email)) {
      issues.push('invalid_email');
    }
    const taxId = cell('taxId');
    const name = cell('name');
    const paymentTerms = cell('paymentTermsDays');
    const normalizedTaxId = normalizeTaxId(taxId);

    const { existingId, ...importRow } = finishRow({
      index,
      name,
      issues,
      existingIndex,
      seenKeys,
      existingPolicy,
      // Two people can share a name, not a tax id; an existing contact saved without its tax id is still found by name
      duplicateKey: normalizedTaxId !== null ? `tax:${normalizedTaxId}` : name !== null ? `name:${normalizeName(name)}` : null,
      matchKeys: name === null ? [] : normalizedTaxId !== null ? [`tax:${normalizedTaxId}`, `untaxed:${normalizeName(name)}`] : [`name:${normalizeName(name)}`],
      record: {
        existingContactId: null,
        kind: getContactKind({ taxId }),
        name: name ?? '',
        taxId,
        email: email !== null && isValidEmail(email) ? email : null,
        phone: cell('phone'),
        addressLine1: cell('addressLine1'),
        addressLine2: cell('addressLine2'),
        postalCode: cell('postalCode'),
        city: cell('city'),
        region: cell('region'),
        country: cell('country'),
        bankAccount: cell('bankAccount'),
        paymentTermsDays: paymentTerms === null ? null : parsePaymentTermsDays(paymentTerms),
        notes: cell('notes'),
      },
    });

    return { ...importRow, record: { ...importRow.record, existingContactId: existingId } };
  });
}

export function buildProductRows({ proposal, mapping, existingPolicy }: { proposal: DataImportProposal; mapping: Array<string | null>; existingPolicy: ExistingPolicy }): ImportRow<ImportedProduct>[] {
  const existingIndex = buildExistingIndex({ proposal });
  const seenKeys = new Set<string>();

  return proposal.rows.map((row, index) => {
    const cell = (field: string) => getCell({ row, mapping, field });
    const issues: RowIssue[] = [];

    const price = cell('unitPrice');
    const priceValue = price === null ? null : parseCellNumber(price);
    if (price !== null && (priceValue === null || priceValue < 0)) {
      issues.push('invalid_price');
    }
    const taxRate = cell('taxRate');
    const taxRateBps = taxRate === null ? null : parseTaxRateBps(taxRate);
    if (taxRate !== null && taxRateBps === null) {
      issues.push('invalid_tax_rate');
    }
    const name = cell('name');

    const { existingId, ...importRow } = finishRow({
      index,
      name,
      issues,
      existingIndex,
      seenKeys,
      existingPolicy,
      duplicateKey: name !== null ? `name:${normalizeName(name)}` : null,
      matchKeys: name !== null ? [`name:${normalizeName(name)}`] : [],
      record: {
        existingProductId: null,
        name: name ?? '',
        description: cell('description'),
        unit: cell('unit')?.slice(0, 40) ?? null,
        unitPriceMinor: priceValue !== null && priceValue >= 0 ? Math.round(priceValue * 100) : null,
        taxRateBps,
      },
    });

    return { ...importRow, record: { ...importRow.record, existingProductId: existingId } };
  });
}

/** Each field once: picking a field for a column takes it away from the column that had it */
export function setColumnField({ mapping, column, field }: { mapping: Array<string | null>; column: number; field: string | null }) {
  return mapping.map((current, index) => (index === column ? field : field !== null && current === field ? null : current));
}

/** The first values of a column, to recognize it */
export function getColumnSamples({ rows, column, count = 3 }: { rows: string[][]; column: number; count?: number }) {
  return rows.map(row => row[column]?.trim() ?? '').filter(value => value !== '').slice(0, count);
}

export function summarizeRows(rows: Array<{ status: RowStatus }>) {
  return {
    create: rows.filter(row => row.status === 'create').length,
    update: rows.filter(row => row.status === 'update').length,
    skip: rows.filter(row => row.status === 'skip').length,
  };
}
