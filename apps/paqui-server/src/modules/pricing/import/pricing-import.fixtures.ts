import JSZip from 'jszip';
import { getColumnLetter } from './pricing-import.models';

type FixtureCell = string | number | { formula: string; value: number } | null;

// A price sheet as companies keep them: two blocks one under the other. The first one has a merged header ("Owen" over
// its two variants), shipping and sales agent rows mixed with the cost lines and totals computed by formulas.
// The second one has a total that does not match its lines (someone typed over the formula).
export const TWO_BLOCKS_SHEET: FixtureCell[][] = [
  ['Tarifa 2026'],
  [],
  ['Modelo:', 'Owen', null, 'Luna'],
  [null, 'Pata madera', 'Pata metal', null],
  ['Carcasa', 120, 120, 95],
  ['Tela', 45.5, 45.5, 38],
  ['Embalaje', 8, 8, 6],
  ['Porte', 25, 25, 20],
  ['Representante', 18, 19, 15],
  ['Coste', { formula: 'SUM(B5:B9)', value: 216.5 }, { formula: 'SUM(C5:C9)', value: 217.5 }, { formula: 'SUM(D5:D9)', value: 174 }],
  ['Precio venta', 320, 325, 260],
  ['Beneficio', { formula: 'B11-B10', value: 103.5 }, { formula: 'C11-C10', value: 107.5 }, { formula: 'D11-D10', value: 86 }],
  [],
  [],
  ['Modelo:', 'Nora', 'Duna'],
  ['Estructura', 60, 70],
  ['Cojines', 30, 35],
  ['Porte', 15, 15],
  ['Coste', 110, { formula: 'SUM(C16:C18)', value: 120 }],
  ['Precio venta', 180, 199],
  ['Beneficio', 70, 79],
];

function buildCellXml({ cell, reference }: { cell: FixtureCell; reference: string }) {
  if (cell === null) {
    return '';
  }
  if (typeof cell === 'number') {
    return `<c r="${reference}"><v>${cell}</v></c>`;
  }
  if (typeof cell === 'string') {
    return `<c r="${reference}" t="inlineStr"><is><t>${cell}</t></is></c>`;
  }
  return `<c r="${reference}"><f>${cell.formula}</f><v>${cell.value}</v></c>`;
}

/** A real .xlsx file of one sheet, with formulas keeping their last computed value like Excel saves them */
export async function buildXlsxFixture({ rows = TWO_BLOCKS_SHEET, sheetName = 'Escandallos' }: { rows?: FixtureCell[][]; sheetName?: string } = {}) {
  const zip = new JSZip();
  zip.file('xl/workbook.xml', `<?xml version="1.0"?><workbook xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets><sheet name="${sheetName}" sheetId="1" r:id="rId1"/></sheets></workbook>`);
  zip.file('xl/_rels/workbook.xml.rels', `<?xml version="1.0"?><Relationships><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/></Relationships>`);
  const rowsXml = rows.map((row, rowIndex) => `<row r="${rowIndex + 1}">${row.map((cell, columnIndex) => buildCellXml({ cell, reference: `${getColumnLetter(columnIndex)}${rowIndex + 1}` })).join('')}</row>`).join('');
  zip.file('xl/worksheets/sheet1.xml', `<?xml version="1.0"?><worksheet><sheetData>${rowsXml}</sheetData><mergeCells count="1"><mergeCell ref="B3:C3"/></mergeCells></worksheet>`);

  return zip.generateAsync({ type: 'nodebuffer' });
}

/** The same sheet as rows of text, the way the parsers give it */
export function toSheetRows(rows: FixtureCell[][] = TWO_BLOCKS_SHEET) {
  const width = Math.max(...rows.map(row => row.length));
  return rows.map(row => Array.from({ length: width }, (_, index) => {
    const cell = row[index] ?? null;
    return cell === null ? '' : typeof cell === 'object' ? String(cell.value) : String(cell);
  }));
}
