import type { Sheet } from '../ai-assistant/attachments/spreadsheet.parsers';
import type { DataImportEntity, DataImportField } from './data-imports.constants';
import { normalizeLabel, parseSheetNumber } from '../pricing/import/pricing-import.models';
import { DATA_IMPORT_FIELDS } from './data-imports.constants';

export type ColumnMapping = Array<DataImportField | null>;

// ----- The sheet and its header -----

// An export holds the records in its largest sheet; the others are usually a cover or totals
export function pickSheet({ sheets }: { sheets: Sheet[] }) {
  return sheets.toSorted((left, right) => right.rows.length - left.rows.length)[0];
}

const isTextCell = (cell: string) => cell.trim() !== '' && parseSheetNumber(cell) === null;

/** 1 based. The header is the row with the most text cells among the first ones: exports often start with a title and a date. */
export function findHeaderRow({ sheet }: { sheet: Sheet }) {
  let best = { row: 1, textCells: 0 };

  sheet.rows.slice(0, 15).forEach((row, index) => {
    const textCells = row.filter(isTextCell).length;
    if (textCells > best.textCells) {
      best = { row: index + 1, textCells };
    }
  });

  return best.row;
}

// ----- Mapping without a model -----

// Fallback names, used only when no model is configured or it fails: the model reads any wording and language
const FIELD_SYNONYMS: { [E in DataImportEntity]: Record<DataImportField<E>, string[]> } = {
  contacts: {
    name: ['nombre', 'razon social', 'nombre fiscal', 'denominacion', 'nombre comercial', 'cliente', 'proveedor', 'empresa', 'name', 'company', 'company name'],
    taxId: ['nif', 'cif', 'dni', 'nie', 'nif cif', 'cif nif', 'nif dni', 'dni nif', 'identificacion fiscal', 'vat', 'vat number', 'tax id'],
    email: ['email', 'e mail', 'mail', 'correo', 'correo electronico'],
    phone: ['telefono', 'telefono 1', 'tel', 'tlf', 'tfno', 'movil', 'phone', 'mobile'],
    addressLine1: ['direccion', 'domicilio', 'calle', 'direccion 1', 'address', 'address 1'],
    addressLine2: ['direccion 2', 'domicilio 2', 'address 2'],
    postalCode: ['cp', 'c p', 'codigo postal', 'cod postal', 'postal code', 'zip', 'zip code'],
    city: ['poblacion', 'localidad', 'ciudad', 'municipio', 'city', 'town'],
    region: ['provincia', 'region', 'comunidad', 'state', 'province'],
    country: ['pais', 'country'],
    paymentTermsDays: ['dias pago', 'dias de pago', 'plazo pago', 'plazo de pago', 'dias vencimiento', 'payment terms'],
    notes: ['observaciones', 'notas', 'comentarios', 'notes', 'comments'],
  },
  products: {
    name: ['nombre', 'descripcion', 'articulo', 'producto', 'concepto', 'denominacion', 'name', 'product', 'item'],
    description: ['descripcion larga', 'detalle', 'observaciones', 'description', 'details'],
    unit: ['unidad', 'unidades', 'ud', 'uds', 'unidad de medida', 'unit'],
    unitPrice: ['precio', 'pvp', 'p v p', 'precio venta', 'precio de venta', 'precio unitario', 'tarifa', 'price', 'unit price'],
    taxRate: ['iva', 'iva %', '% iva', 'tipo iva', 'tipo de iva', 'impuesto', 'vat', 'tax', 'tax rate'],
  },
};

function scoreHeader({ header, synonyms }: { header: string; synonyms: string[] }) {
  const normalized = normalizeLabel(header);
  if (normalized === '') {
    return 0;
  }
  // "C.I.F." and "C.P." are abbreviations: compared without their dots and spaces
  const compact = normalized.replace(/ /g, '');
  if (synonyms.some(synonym => synonym === normalized || synonym.replace(/ /g, '') === compact)) {
    return 2;
  }
  // "Nombre del cliente", "Teléfono fijo": the synonym appears as whole words
  return synonyms.some(synonym => ` ${normalized} `.includes(` ${synonym} `)) ? 1 : 0;
}

export function mapColumnsWithRules({ entity, headers }: { entity: DataImportEntity; headers: string[] }): ColumnMapping {
  const fields = DATA_IMPORT_FIELDS[entity] as readonly DataImportField[];
  const synonymsByField = FIELD_SYNONYMS[entity] as Record<DataImportField, string[]>;

  const candidates = headers.flatMap((header, column) => fields.map((field, fieldIndex) => ({ column, field, fieldIndex, score: scoreHeader({ header, synonyms: synonymsByField[field] }) })))
    .filter(candidate => candidate.score > 0)
    // Exact names first, then the leftmost column, then the field listed first
    .sort((left, right) => right.score - left.score || left.column - right.column || left.fieldIndex - right.fieldIndex);

  const mapping: ColumnMapping = headers.map(() => null);
  const usedFields = new Set<DataImportField>();

  for (const { column, field } of candidates) {
    if (mapping[column] === null && !usedFields.has(field)) {
      mapping[column] = field;
      usedFields.add(field);
    }
  }

  return mapping;
}

// ----- The model answer -----

/** Each field once, only the columns of the header, only the fields of the entity */
export function sanitizeMapping({ entity, mapping, columnCount }: { entity: DataImportEntity; mapping: ColumnMapping; columnCount: number }): ColumnMapping {
  const fields = DATA_IMPORT_FIELDS[entity] as readonly string[];
  const usedFields = new Set<string>();

  return Array.from({ length: columnCount }, (_, column) => {
    const field = mapping[column] ?? null;
    if (field === null || !fields.includes(field) || usedFields.has(field)) {
      return null;
    }
    usedFields.add(field);
    return field;
  });
}

export function hasNameColumn({ mapping }: { mapping: ColumnMapping }) {
  return mapping.includes('name');
}

// ----- Rows -----

/** The rows under the header that hold something, as many cells as the header */
export function getDataRows({ sheet, headerRow, maxRows }: { sheet: Sheet; headerRow: number; maxRows: number }) {
  const columnCount = sheet.rows[headerRow - 1]?.length ?? 0;
  const rows = sheet.rows.slice(headerRow)
    .filter(row => row.some(cell => cell.trim() !== ''))
    .map(row => Array.from({ length: columnCount }, (_, index) => row[index]?.trim() ?? ''));

  return { rows: rows.slice(0, maxRows), isTruncated: rows.length > maxRows };
}
