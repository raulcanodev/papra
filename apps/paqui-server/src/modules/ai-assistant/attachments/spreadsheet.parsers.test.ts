import { Buffer } from 'node:buffer';
import JSZip from 'jszip';
import { describe, expect, test } from 'vitest';
import { detectCsvDelimiter, getColumnIndex, parseCsv, parseXlsx, trimSheetRows } from './spreadsheet.parsers';

async function buildXlsx() {
  const zip = new JSZip();
  zip.file('xl/workbook.xml', `<?xml version="1.0"?><workbook xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets><sheet name="Tarifa 2026" sheetId="1" r:id="rId1"/><sheet name="Vacía" sheetId="2" r:id="rId2"/></sheets></workbook>`);
  zip.file('xl/_rels/workbook.xml.rels', `<?xml version="1.0"?><Relationships><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/><Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="/xl/worksheets/sheet2.xml"/></Relationships>`);
  zip.file('xl/sharedStrings.xml', `<?xml version="1.0"?><sst><si><t>Referencia</t></si><si><t>Descripción</t></si><si><t>Precio</t></si><si><r><t>Tornillo </t></r><r><t>M8</t></r></si></sst>`);
  // Row 2 skipped in the file, C3 empty: the columns must stay aligned
  zip.file('xl/worksheets/sheet1.xml', `<?xml version="1.0"?><worksheet><sheetData>
    <row r="1"><c r="A1" t="s"><v>0</v></c><c r="B1" t="s"><v>1</v></c><c r="C1" t="s"><v>2</v></c></row>
    <row r="3"><c r="A3" t="inlineStr"><is><t>R-001</t></is></c><c r="B3" t="s"><v>3</v></c></row>
    <row r="4"><c r="A4"><v>0012</v></c><c r="C4"><v>1.5</v></c></row>
  </sheetData></worksheet>`);
  zip.file('xl/worksheets/sheet2.xml', `<?xml version="1.0"?><worksheet><sheetData/></worksheet>`);

  return zip.generateAsync({ type: 'nodebuffer' });
}

describe('spreadsheet parsers', () => {
  test('cell references give the column, from A to multi letter columns', () => {
    expect(getColumnIndex({ cellReference: 'A1' })).toBe(0);
    expect(getColumnIndex({ cellReference: 'C12' })).toBe(2);
    expect(getColumnIndex({ cellReference: 'AA3' })).toBe(26);
  });

  test('an xlsx keeps its sheets, names and columns aligned, even with skipped rows and empty cells', async () => {
    const sheets = await parseXlsx({ data: await buildXlsx() });

    expect(sheets).toEqual([
      {
        name: 'Tarifa 2026',
        rows: [
          ['Referencia', 'Descripción', 'Precio'],
          ['', '', ''],
          ['R-001', 'Tornillo M8', ''],
          ['0012', '', '1.5'],
        ],
      },
      { name: 'Vacía', rows: [] },
    ]);
  });

  test('a file that is not a spreadsheet is rejected, the caller reports it instead of crashing', async () => {
    await expect(parseXlsx({ data: Buffer.from('not a zip') })).rejects.toThrow();
  });

  test('csv files from Spanish software use semicolons, quoted cells can hold the delimiter, quotes and line breaks', () => {
    const text = '﻿Nombre;NIF;Importe\n"Papelería ""El Lápiz""";B12345678;"1.234,50"\r\n"Calle Mayor; 1\nMadrid";;\n';

    expect(detectCsvDelimiter({ text })).toBe(';');
    expect(parseCsv({ text })).toEqual([{
      name: 'CSV',
      rows: [
        ['Nombre', 'NIF', 'Importe'],
        ['Papelería "El Lápiz"', 'B12345678', '1.234,50'],
        ['Calle Mayor; 1\nMadrid', '', ''],
      ],
    }]);
  });

  test('trailing empty rows and columns are dropped', () => {
    expect(trimSheetRows({ rows: [['a', '', ''], ['', 'b', ''], ['', '', ''], []] })).toEqual([['a', ''], ['', 'b']]);
  });
});
