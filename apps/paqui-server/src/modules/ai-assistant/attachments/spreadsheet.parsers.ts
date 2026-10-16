import type { Buffer } from 'node:buffer';
import { XMLParser } from 'fast-xml-parser';
import JSZip from 'jszip';

export type Sheet = { name: string; rows: string[][] };

type XmlNode = Record<string, unknown>;

const asNode = (value: unknown): XmlNode | undefined => (value !== null && typeof value === 'object' && !Array.isArray(value) ? value as XmlNode : undefined);
const asArray = (value: unknown): unknown[] => (Array.isArray(value) ? value : value === null || value === undefined ? [] : [value]);

function getText(value: unknown): string {
  if (value === null || value === undefined) {
    return '';
  }
  if (typeof value !== 'object') {
    return String(value);
  }
  const node = value as XmlNode;
  return node['#text'] === undefined ? '' : String(node['#text']);
}

// "AB12" -> 27 (zero based column of the cell reference)
export function getColumnIndex({ cellReference }: { cellReference: string }) {
  const letters = /^[A-Z]+/i.exec(cellReference)?.[0].toUpperCase() ?? '';

  return [...letters].reduce((index, letter) => index * 26 + letter.charCodeAt(0) - 64, 0) - 1;
}

// Empty trailing rows and columns say nothing, empty cells in between keep the columns aligned
export function trimSheetRows({ rows }: { rows: string[][] }) {
  const trimmedRows = rows.map(row => row.map(cell => cell.trim()));

  while (trimmedRows.length > 0 && trimmedRows.at(-1)!.every(cell => cell === '')) {
    trimmedRows.pop();
  }

  const columnCount = Math.max(0, ...trimmedRows.map(row => row.findLastIndex(cell => cell !== '') + 1));

  return trimmedRows.map(row => Array.from({ length: columnCount }, (_, index) => row[index] ?? ''));
}

function getSharedString(item: unknown) {
  const node = asNode(item);
  if (!node) {
    return '';
  }
  if (node.t !== undefined) {
    return getText(node.t);
  }
  // Rich text: several runs with their own formatting
  return asArray(node.r).map(run => getText(asNode(run)?.t)).join('');
}

export async function parseXlsx({ data }: { data: Buffer | ArrayBuffer }): Promise<Sheet[]> {
  const zip = await JSZip.loadAsync(data);
  const parser = new XMLParser({ ignoreAttributes: false, attributeNamePrefix: '@_', textNodeName: '#text', parseTagValue: false, trimValues: false });
  const readXml = async (path: string) => {
    const xml = await zip.file(path)?.async('text');
    return xml === undefined ? undefined : asNode(parser.parse(xml));
  };

  const sharedStrings = asArray(asNode((await readXml('xl/sharedStrings.xml'))?.sst)?.si).map(getSharedString);

  // Sheet names and files, in workbook order
  const targets = new Map(asArray(asNode((await readXml('xl/_rels/workbook.xml.rels'))?.Relationships)?.Relationship)
    .map(asNode)
    .filter(relation => relation !== undefined && String(relation['@_Type'] ?? '').endsWith('/worksheet'))
    .map(relation => [String(relation!['@_Id']), String(relation!['@_Target']).replace(/^\/?(?:xl\/)?/, 'xl/')]));

  const sheetEntries = asArray(asNode(asNode((await readXml('xl/workbook.xml'))?.workbook)?.sheets)?.sheet)
    .map(asNode)
    .filter(sheet => sheet !== undefined)
    .map(sheet => ({ name: String(sheet['@_name'] ?? ''), path: targets.get(String(sheet['@_r:id'])) }))
    .filter((sheet): sheet is { name: string; path: string } => sheet.path !== undefined);

  const sheets: Sheet[] = [];

  for (const { name, path } of sheetEntries) {
    const sheetData = asNode(asNode((await readXml(path))?.worksheet)?.sheetData);
    const rows: string[][] = [];

    for (const rowValue of asArray(sheetData?.row)) {
      const row = asNode(rowValue);
      // Rows can be skipped in the file (empty ones): their number keeps them in place
      const rowIndex = Number(row?.['@_r'] ?? rows.length + 1) - 1;
      const cells: string[] = [];

      asArray(row?.c).map(asNode).forEach((cell, position) => {
        if (!cell) {
          return;
        }

        const reference = cell['@_r'];
        const columnIndex = typeof reference === 'string' ? getColumnIndex({ cellReference: reference }) : position;
        const type = cell['@_t'];
        const value = getText(cell.v);

        cells[columnIndex] = type === 's'
          ? (sharedStrings[Number(value)] ?? '')
          : type === 'inlineStr'
            ? getSharedString(asNode(cell.is))
            : value;
      });

      rows[rowIndex] = Array.from(cells, cell => cell ?? '');
    }

    sheets.push({ name, rows: trimSheetRows({ rows: Array.from(rows, row => row ?? []) }) });
  }

  return sheets;
}

// Spanish exports use ";" (the comma is the decimal separator), others "," or tabs
export function detectCsvDelimiter({ text }: { text: string }) {
  const sample = text.split(/\r?\n/).slice(0, 10).join('\n');
  const candidates = [';', ',', '\t', '|'];

  return candidates.toSorted((a, b) => sample.split(b).length - sample.split(a).length)[0]!;
}

export function parseCsv({ text, delimiter = detectCsvDelimiter({ text }) }: { text: string; delimiter?: string }): Sheet[] {
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = '';
  let isQuoted = false;
  const content = text.replace(/^\uFEFF/, '');

  for (let index = 0; index < content.length; index++) {
    const char = content[index]!;

    if (isQuoted) {
      if (char === '"' && content[index + 1] === '"') {
        cell += '"';
        index++;
      } else if (char === '"') {
        isQuoted = false;
      } else {
        cell += char;
      }
      continue;
    }

    if (char === '"' && cell === '') {
      isQuoted = true;
    } else if (char === delimiter) {
      row.push(cell);
      cell = '';
    } else if (char === '\n' || char === '\r') {
      if (char === '\r' && content[index + 1] === '\n') {
        index++;
      }
      row.push(cell);
      rows.push(row);
      row = [];
      cell = '';
    } else {
      cell += char;
    }
  }

  if (cell !== '' || row.length > 0) {
    row.push(cell);
    rows.push(row);
  }

  return [{ name: 'CSV', rows: trimSheetRows({ rows }) }];
}
