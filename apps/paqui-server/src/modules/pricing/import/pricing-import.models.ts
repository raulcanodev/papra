import type { Sheet } from '../../ai-assistant/attachments/spreadsheet.parsers';
import type { ImportBlock, ImportIssue, ImportRowRole, SheetBlockLayout, SheetLayout } from './pricing-import.types';

// ----- Cells -----

/** A number as a spreadsheet shows it: "45.5" (xlsx), "1.234,56" or "12,5 €" (Spanish CSV), "1,234.56"; null for text and percentages */
export function parseSheetNumber(text: string): number | null {
  const compact = text.trim().replace(/[\s€$£]/g, '');

  if (compact === '' || compact.endsWith('%') || !/^-?[\d.,]+$/.test(compact) || !/\d/.test(compact)) {
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

export function toMinor(value: number) {
  return Math.round(value * 100);
}

// "C" -> 2, "AA" -> 26
export function getColumnIndexFromLetter(letter: string) {
  return [...letter.trim().toUpperCase()].reduce((index, char) => index * 26 + char.charCodeAt(0) - 64, 0) - 1;
}

export function getColumnLetter(index: number): string {
  return index < 26 ? String.fromCharCode(65 + index) : `${getColumnLetter(Math.floor(index / 26) - 1)}${String.fromCharCode(65 + (index % 26))}`;
}

const cellAt = (sheet: Sheet, rowIndex: number, columnIndex: number) => sheet.rows[rowIndex]?.[columnIndex]?.trim() ?? '';
const isNumberCell = (text: string) => parseSheetNumber(text) !== null;
const isTextCell = (text: string) => text !== '' && !isNumberCell(text);

/** Lowercase, no accents, no punctuation: "Precio Venta:" -> "precio venta" */
export function normalizeLabel(text: string) {
  return text.normalize('NFD').replace(/\p{M}/gu, '').toLowerCase().replace(/[^a-z0-9%]+/g, ' ').trim();
}

// ----- What the model reads -----

/** Each non empty cell with its reference, so the model can answer with row numbers and column letters */
export function formatSheetForModel({ sheet, maxRows, maxColumns }: { sheet: Sheet; maxRows: number; maxColumns: number }) {
  const lines = sheet.rows.slice(0, maxRows).flatMap((row, rowIndex) => {
    const cells = row.slice(0, maxColumns).flatMap((cell, columnIndex) => (cell.trim() === '' ? [] : [`${getColumnLetter(columnIndex)}=${cell.trim().replace(/\s+/g, ' ').slice(0, 80)}`]));
    return cells.length === 0 ? [] : [`${rowIndex + 1}: ${cells.join(' | ')}`];
  });

  return [`### Sheet "${sheet.name}" (${sheet.rows.length} rows)`, ...lines, ...(sheet.rows.length > maxRows ? [`(${sheet.rows.length - maxRows} more rows not shown)`] : [])].join('\n');
}

// ----- Layout detection without a model -----

// Fallback words, used only when no model is configured or it fails. The model reads any language and wording.
const SHIPPING_WORDS = ['porte', 'portes', 'transporte', 'envio', 'envios', 'shipping', 'freight', 'flete', 'delivery', 'mensajeria', 'logistica', 'carriage', 'postage'];
const COMMISSION_WORDS = ['comision', 'comisiones', 'representante', 'representantes', 'agente', 'agentes', 'commission', 'commissions', 'rappel', 'broker', 'comercial'];
const MARGIN_WORDS = ['beneficio', 'beneficios', 'margen', 'margin', 'profit', 'ganancia', 'markup', 'utilidad'];
const PRICE_WORDS = ['precio', 'precios', 'pvp', 'venta', 'price', 'tarifa', 'selling', 'sale', 'sales', 'pv'];
const COST_WORDS = ['coste', 'costes', 'costo', 'costos', 'cost', 'costs', 'total'];
// The other words a total cost label may have: "Coste total", "Precio de coste", "Total coste fabricación"
const COST_LABEL_WORDS = [...COST_WORDS, 'de', 'del', 'el', 'fabricacion', 'produccion', 'unitario', 'precio', 'final', 'neto'];

const hasWord = (label: string, words: string[]) => normalizeLabel(label).split(' ').some(word => words.includes(word));

function isTotalCostLabel(label: string) {
  const words = normalizeLabel(label).split(' ').filter(Boolean);
  return words.length > 0 && words.some(word => COST_WORDS.includes(word)) && words.every(word => COST_LABEL_WORDS.includes(word));
}

export function guessConceptRole(label: string): ImportRowRole {
  if (hasWord(label, SHIPPING_WORDS)) {
    return 'shipping';
  }
  return hasWord(label, COMMISSION_WORDS) ? 'commission' : 'cost_line';
}

function isDataRow(row: string[] = []) {
  const first = row.findIndex(cell => cell.trim() !== '');
  return first !== -1 && isTextCell(row[first]!.trim()) && row.slice(first + 1).some(cell => isNumberCell(cell.trim()));
}
const isTextOnlyRow = (row: string[] = []) => row.some(cell => cell.trim() !== '') && row.every(cell => !isNumberCell(cell.trim()));
const textColumns = (row: string[] = []) => row.flatMap((cell, index) => (isTextCell(cell.trim()) ? [index] : []));
const isEmptyRow = (row: string[] = []) => row.every(cell => cell.trim() === '');

function nextNonEmptyRow(sheet: Sheet, fromIndex: number) {
  for (let index = fromIndex + 1; index < sheet.rows.length; index++) {
    if (!isEmptyRow(sheet.rows[index])) {
      return index;
    }
  }
  return null;
}

// A header names the products in its columns and is followed (maybe after a row of variants) by rows of figures
function findBlockStart(sheet: Sheet, rowIndex: number) {
  const row = sheet.rows[rowIndex];
  if (!isTextOnlyRow(row) || textColumns(row).length < 2) {
    return null;
  }

  const next = nextNonEmptyRow(sheet, rowIndex);
  if (next === null) {
    return null;
  }
  if (isDataRow(sheet.rows[next])) {
    return { variantRowIndex: null, firstDataRowIndex: next };
  }

  const afterVariants = isTextOnlyRow(sheet.rows[next]) ? nextNonEmptyRow(sheet, next) : null;
  return afterVariants !== null && isDataRow(sheet.rows[afterVariants]) ? { variantRowIndex: next, firstDataRowIndex: afterVariants } : null;
}

function sumsUpTo({ values, index, columns }: { values: Array<Array<number | null>>; index: number; columns: number[] }) {
  return index > 1 && columns.some(column => (values[index]![column] ?? 0) !== 0) && columns.every((column) => {
    const sum = values.slice(0, index).reduce((total, row) => total + (row[column] ?? 0), 0);
    return Math.abs(sum - (values[index]![column] ?? 0)) <= getTolerance(index);
  });
}

// Roles of the figure rows of a block: concept lines, then the total cost, the selling price and the margin
export function guessRowRoles({ labels, values, columns }: { labels: string[]; values: Array<Array<number | null>>; columns: number[] }): ImportRowRole[] {
  const roles: ImportRowRole[] = labels.map(() => 'ignore');
  const marginIndex = labels.findIndex(label => hasWord(label, MARGIN_WORDS));
  const labelledCostIndex = labels.findIndex((label, index) => index !== marginIndex && isTotalCostLabel(label));
  // Without a recognizable label, the total is the first row equal to the sum of the rows above it
  const costIndex = labelledCostIndex !== -1 ? labelledCostIndex : values.findIndex((_, index) => sumsUpTo({ values, index, columns }));
  const priceIndex = labels.findIndex((label, index) => index !== marginIndex && index !== costIndex && (costIndex === -1 || index > costIndex) && hasWord(label, PRICE_WORDS));
  const conceptsEnd = costIndex !== -1 ? costIndex : priceIndex !== -1 ? priceIndex : labels.length;

  for (let index = 0; index < conceptsEnd; index++) {
    if (index !== marginIndex) {
      roles[index] = guessConceptRole(labels[index]!);
    }
  }

  if (costIndex !== -1) {
    roles[costIndex] = 'total_cost';
  }
  if (priceIndex !== -1) {
    roles[priceIndex] = 'selling_price';
  }
  if (marginIndex !== -1 && marginIndex > conceptsEnd - 1) {
    roles[marginIndex] = 'margin';
  }

  return roles;
}

export function detectLayoutWithRules({ sheet }: { sheet: Sheet }): SheetLayout {
  const blocks: SheetBlockLayout[] = [];
  let rowIndex = 0;

  while (rowIndex < sheet.rows.length) {
    const start = findBlockStart(sheet, rowIndex);
    if (!start) {
      rowIndex++;
      continue;
    }

    const headerRow = sheet.rows[rowIndex]!;
    const variantRow = start.variantRowIndex === null ? [] : sheet.rows[start.variantRowIndex]!;
    const labelColumn = sheet.rows[start.firstDataRowIndex]!.findIndex(cell => cell.trim() !== '');

    // The figure rows run until two empty rows or the header of the next block
    const dataRowIndexes: number[] = [];
    let emptyCount = 0;
    let index = start.firstDataRowIndex;
    for (; index < sheet.rows.length; index++) {
      const row = sheet.rows[index];
      if (isEmptyRow(row)) {
        if (++emptyCount >= 2) {
          break;
        }
        continue;
      }
      if (findBlockStart(sheet, index)) {
        break;
      }
      emptyCount = 0;
      if (isTextCell(cellAt(sheet, index, labelColumn)) && isDataRow(row)) {
        dataRowIndexes.push(index);
      }
    }

    const width = Math.max(headerRow.length, variantRow.length);
    const productColumns = Array.from({ length: width }, (_, column) => column).filter(column => column > labelColumn
      && (isTextCell(cellAt(sheet, rowIndex, column)) || isTextCell(variantRow[column]?.trim() ?? ''))
      && dataRowIndexes.some(dataIndex => isNumberCell(cellAt(sheet, dataIndex, column))));

    const labels = dataRowIndexes.map(dataIndex => cellAt(sheet, dataIndex, labelColumn));
    const values = dataRowIndexes.map(dataIndex => sheet.rows[dataIndex]!.map(cell => parseSheetNumber(cell)));
    const roles = guessRowRoles({ labels, values, columns: productColumns });

    if (productColumns.length > 0) {
      blocks.push({
        title: findTitle({ sheet, headerRowIndex: rowIndex, previousBlockEnd: blocks.at(-1)?.rows.at(-1)?.row ?? 0 }),
        headerRow: rowIndex + 1,
        variantRow: start.variantRowIndex === null ? null : start.variantRowIndex + 1,
        labelColumn,
        productColumns,
        rows: dataRowIndexes.map((dataIndex, position) => ({ row: dataIndex + 1, role: roles[position]! })),
      });
    }

    rowIndex = Math.max(index, rowIndex + 1);
  }

  return { sheetName: sheet.name, blocks };
}

// A lone text just above the header ("Tarifa 2026", "Sofás") names the block
function findTitle({ sheet, headerRowIndex, previousBlockEnd }: { sheet: Sheet; headerRowIndex: number; previousBlockEnd: number }) {
  for (let index = headerRowIndex - 1; index >= Math.max(previousBlockEnd, headerRowIndex - 2); index--) {
    const texts = textColumns(sheet.rows[index]);
    if (texts.length === 1 && sheet.rows[index]!.filter(cell => cell.trim() !== '').length === 1) {
      return cellAt(sheet, index, texts[0]!);
    }
  }
  return null;
}

// ----- Reading the figures of a layout -----

// Each line is rounded to the cent in the file: the sum can differ from the total by that much
function getTolerance(lineCount: number) {
  return Math.ceil(lineCount / 2) / 100 + 0.001;
}

function getProductNames({ sheet, layout }: { sheet: Sheet; layout: SheetBlockLayout }) {
  const headerIndex = layout.headerRow - 1;
  const variantIndex = layout.variantRow === null ? null : layout.variantRow - 1;
  let previousName = '';

  // Columns are walked left to right: a merged header only fills its first cell, its variants repeat that name
  return layout.productColumns.toSorted((a, b) => a - b).map((column) => {
    const variant = variantIndex === null ? '' : cellAt(sheet, variantIndex, column);
    const header = cellAt(sheet, headerIndex, column);
    const name = header !== '' ? header : (variant !== '' ? previousName : '');
    previousName = name !== '' ? name : previousName;

    const baseName = name !== '' ? name : variant;
    const hasVariant = variant !== '' && name !== '';
    return { column, baseName, variant: hasVariant ? variant : null, name: hasVariant ? `${baseName} (${variant})` : baseName };
  });
}

/** Applies a layout to its sheet: products, concept lines and computed rows, with the checks of the computed rows */
export function readBlocks({ sheet, layout, blockIdPrefix = 'b' }: { sheet: Sheet; layout: SheetLayout; blockIdPrefix?: string }): ImportBlock[] {
  return layout.blocks.flatMap((blockLayout, blockIndex) => {
    const id = `${blockIdPrefix}${blockIndex + 1}`;
    const valueAt = (row: number, column: number) => {
      const value = parseSheetNumber(cellAt(sheet, row - 1, column));
      return value === null ? null : toMinor(value);
    };
    const firstRowOf = (role: ImportRowRole) => blockLayout.rows.find(row => row.role === role)?.row ?? null;

    const concepts = blockLayout.rows
      .flatMap(({ row, role }) => (role === 'cost_line' || role === 'shipping' || role === 'commission' ? [{ row, role }] : []))
      .map(({ row, role }) => ({ row, name: cellAt(sheet, row - 1, blockLayout.labelColumn).replace(/:\s*$/, '').trim(), kind: role === 'cost_line' ? 'cost' as const : role }))
      .filter(concept => concept.name !== '');

    const costRow = firstRowOf('total_cost');
    const priceRow = firstRowOf('selling_price');
    const marginRow = firstRowOf('margin');
    const tolerance = toMinor(getTolerance(concepts.length));
    const issues: ImportIssue[] = [];

    const products = getProductNames({ sheet, layout: blockLayout }).flatMap(({ column, baseName, variant, name }) => {
      const amounts = concepts.map(concept => valueAt(concept.row, column) ?? 0);
      const linesTotalMinor = amounts.reduce((total, amount) => total + amount, 0);
      const costMinor = costRow === null ? null : valueAt(costRow, column);
      const priceMinor = priceRow === null ? null : valueAt(priceRow, column);
      const marginMinor = marginRow === null ? null : valueAt(marginRow, column);

      // An empty column (a spacer, a product without figures yet) is not a product
      if (name === '' || (linesTotalMinor === 0 && (priceMinor ?? 0) === 0)) {
        return [];
      }

      const key = `${id}-${getColumnLetter(column)}`;
      if (costMinor !== null && Math.abs(costMinor - linesTotalMinor) > tolerance) {
        issues.push({ code: 'cost_mismatch', productKey: key, expectedMinor: costMinor, actualMinor: linesTotalMinor });
      }
      if (costMinor !== null && priceMinor !== null && marginMinor !== null && Math.abs(priceMinor - costMinor - marginMinor) > 1) {
        issues.push({ code: 'margin_mismatch', productKey: key, expectedMinor: marginMinor, actualMinor: priceMinor - costMinor });
      }
      if (amounts.some(amount => amount < 0)) {
        issues.push({ code: 'negative_amount', productKey: key, expectedMinor: null, actualMinor: null });
      }

      return [{ key, column: getColumnLetter(column), name: name.slice(0, 200), baseName, variant, amounts, linesTotalMinor, costMinor, priceMinor, marginMinor }];
    });

    if (products.length === 0) {
      return [];
    }
    if (costRow === null) {
      issues.push({ code: 'missing_cost_row', productKey: null, expectedMinor: null, actualMinor: null });
    }
    if (priceRow === null) {
      issues.push({ code: 'missing_price_row', productKey: null, expectedMinor: null, actualMinor: null });
    }

    return [{
      id,
      sheetName: sheet.name,
      title: blockLayout.title,
      headerRow: blockLayout.headerRow,
      concepts,
      products,
      issues,
      // Only a total that does not match its lines puts the cost breakdowns in doubt
      isBalanced: !issues.some(issue => issue.code === 'cost_mismatch' || issue.code === 'missing_cost_row'),
    }];
  });
}

/** Keeps what points inside the sheet, drops the rest: a model answer is never trusted blindly */
export function sanitizeLayout({ sheet, layout }: { sheet: Sheet; layout: SheetLayout }): SheetLayout {
  const rowCount = sheet.rows.length;
  const isRow = (row: number) => Number.isInteger(row) && row >= 1 && row <= rowCount;

  return {
    sheetName: sheet.name,
    blocks: layout.blocks
      .filter(block => isRow(block.headerRow) && block.labelColumn >= 0)
      .map(block => ({
        ...block,
        variantRow: block.variantRow !== null && isRow(block.variantRow) && block.variantRow !== block.headerRow ? block.variantRow : null,
        productColumns: [...new Set(block.productColumns)].filter(column => column >= 0 && column !== block.labelColumn),
        rows: block.rows.filter((row, index, rows) => isRow(row.row) && row.row !== block.headerRow && rows.findIndex(other => other.row === row.row) === index).toSorted((a, b) => a.row - b.row),
      }))
      .filter(block => block.productColumns.length > 0 && block.rows.length > 0),
  };
}

/** Lowercase without accents nor extra spaces, to find a product of the catalog by its name */
export function normalizeProductName(name: string) {
  return name.normalize('NFD').replace(/\p{M}/gu, '').toLowerCase().replace(/[\s\-_/·]+/g, ' ').replace(/[()]/g, '').trim();
}

/** The catalog product with the same name, written "Owen (Pata madera)", "Owen - Pata madera" or "Owen Pata madera" */
export function findMatchingProduct<T extends { id: string; name: string }>({ products, name, baseName, variant }: { products: T[]; name: string; baseName: string; variant: string | null }) {
  const candidates = new Set([name, variant === null ? baseName : `${baseName} ${variant}`].map(normalizeProductName));
  return products.find(product => candidates.has(normalizeProductName(product.name))) ?? null;
}
