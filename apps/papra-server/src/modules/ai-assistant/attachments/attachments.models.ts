import type { Sheet } from './spreadsheet.parsers';
import { CSV_MIME_TYPES, LEGACY_XLS_MIME_TYPES, MAX_TABLE_CELL_CHARS, VISION_IMAGE_MIME_TYPES, XLSX_MIME_TYPES } from './attachments.constants';

export type DocumentReadingStrategy = 'xlsx' | 'csv' | 'legacy_xls' | 'image' | 'text';

// Browsers and phones are not consistent with spreadsheet mime types, the extension settles it
export function getDocumentReadingStrategy({ mimeType, name }: { mimeType: string; name: string }): DocumentReadingStrategy {
  const extension = /\.([a-z0-9]+)$/i.exec(name)?.[1]?.toLowerCase();

  if (XLSX_MIME_TYPES.includes(mimeType) || extension === 'xlsx' || extension === 'xlsm') {
    return 'xlsx';
  }

  if (CSV_MIME_TYPES.includes(mimeType) || extension === 'csv' || extension === 'tsv') {
    return 'csv';
  }

  if (LEGACY_XLS_MIME_TYPES.includes(mimeType) || extension === 'xls') {
    return 'legacy_xls';
  }

  if (mimeType.startsWith('image/')) {
    return 'image';
  }

  return 'text';
}

export function canBeSentToVisionModel({ mimeType }: { mimeType: string }) {
  return VISION_IMAGE_MIME_TYPES.includes(mimeType);
}

export type TableSlice = {
  name: string;
  rowCount: number;
  columnCount: number;
  // 1 based, like the row numbers of the spreadsheet itself
  fromRow: number;
  rows: string[][];
  hasMore: boolean;
};

export type DocumentContent
  = | { kind: 'table'; sheets: TableSlice[] }
    | { kind: 'text'; text: string; totalChars: number; fromChar: number; hasMore: boolean }
    | { kind: 'image'; text: string | null }
    | { kind: 'unreadable'; reason: string };

export function sliceSheet({ sheet, fromRow = 1, maxRows }: { sheet: Sheet; fromRow?: number; maxRows: number }): TableSlice {
  const start = Math.max(1, fromRow);
  const rows = sheet.rows.slice(start - 1, start - 1 + maxRows);

  return {
    name: sheet.name,
    rowCount: sheet.rows.length,
    columnCount: sheet.rows[0]?.length ?? 0,
    fromRow: start,
    rows,
    hasMore: start - 1 + rows.length < sheet.rows.length,
  };
}

export function sliceText({ text, fromChar = 0, maxChars }: { text: string; fromChar?: number; maxChars: number }) {
  const start = Math.max(0, fromChar);

  return { text: text.slice(start, start + maxChars), totalChars: text.length, fromChar: start, hasMore: start + maxChars < text.length };
}

const toColumnName = (index: number): string => (index < 26 ? String.fromCharCode(65 + index) : `${toColumnName(Math.floor(index / 26) - 1)}${String.fromCharCode(65 + (index % 26))}`);

function formatCell(cell: string) {
  const flat = cell.replace(/\s*\n\s*/g, ' / ').replace(/\|/g, '\\|');
  return flat.length > MAX_TABLE_CELL_CHARS ? `${flat.slice(0, MAX_TABLE_CELL_CHARS)}…` : flat;
}

// A markdown table with the spreadsheet row numbers and column letters: the model can refer to "row 12, column C"
// and ask for the next rows, whatever the layout (headers on row 4, several tables in a sheet...)
export function formatTableSlice({ slice }: { slice: TableSlice }) {
  const header = `Sheet "${slice.name}": ${slice.rowCount} rows x ${slice.columnCount} columns${slice.rowCount === 0 ? ' (empty)' : `, rows ${slice.fromRow}-${slice.fromRow + slice.rows.length - 1} shown`}`;

  if (slice.rows.length === 0) {
    return header;
  }

  const columns = Array.from({ length: slice.columnCount }, (_, index) => toColumnName(index));
  const lines = [
    `| # | ${columns.join(' | ')} |`,
    `|---|${columns.map(() => '---').join('|')}|`,
    ...slice.rows.map((row, index) => `| ${slice.fromRow + index} | ${row.map(formatCell).join(' | ')} |`),
  ];

  return [header, ...lines, slice.hasMore ? `(more rows: read from row ${slice.fromRow + slice.rows.length})` : undefined].filter(line => line !== undefined).join('\n');
}

export function formatDocumentContentForModel({ document, content }: { document: { id: string; name: string; mimeType: string }; content: DocumentContent }) {
  const title = `[File "${document.name}" (${document.mimeType}), documentId: ${document.id}]`;

  switch (content.kind) {
    case 'table':
      return [title, ...content.sheets.map(slice => formatTableSlice({ slice })), 'Excel dates may show as serial numbers (days since 1899-12-30), decimals use a dot.'].join('\n\n');
    case 'text':
      return [title, content.text || '(no text)', content.hasMore ? `(${content.totalChars} characters in total, read the rest from character ${content.fromChar + content.text.length})` : undefined].filter(Boolean).join('\n\n');
    case 'image':
      return [title, 'Image attached below.', content.text !== null && content.text !== '' ? `Text recognized on it (may contain OCR mistakes):\n${content.text}` : undefined].filter(Boolean).join('\n\n');
    case 'unreadable':
      return `${title}\nIt could not be read: ${content.reason}`;
  }
}

// What a chat message keeps of each attached file, to show it again as a badge
export type ChatAttachment = { documentId: string; name: string; mimeType: string; size: number };

export function toChatAttachment(document: { id: string; name: string; mimeType: string; originalSize: number }): ChatAttachment {
  return { documentId: document.id, name: document.name, mimeType: document.mimeType, size: document.originalSize };
}

// Several files share the room of one: each gets a smaller inline part, the assistant reads the rest on demand
export function getInlineBudget({ attachmentCount, maxChars, maxRows }: { attachmentCount: number; maxChars: number; maxRows: number }) {
  const count = Math.max(1, attachmentCount);

  return { maxChars: Math.max(4_000, Math.floor(maxChars * 2 / (count + 1))), maxRows: Math.max(30, Math.floor(maxRows * 2 / (count + 1))) };
}
