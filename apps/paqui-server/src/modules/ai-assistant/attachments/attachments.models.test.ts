import { describe, expect, test } from 'vitest';
import { formatDocumentContentForModel, formatTableSlice, getDocumentReadingStrategy, getInlineBudget, sliceSheet, sliceText } from './attachments.models';

describe('attachments models', () => {
  test('the reading strategy comes from the mime type or, when browsers get it wrong, the extension', () => {
    expect(getDocumentReadingStrategy({ mimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', name: 'tarifa' })).toBe('xlsx');
    expect(getDocumentReadingStrategy({ mimeType: 'application/octet-stream', name: 'Tarifa 2026.XLSX' })).toBe('xlsx');
    expect(getDocumentReadingStrategy({ mimeType: 'text/plain', name: 'clientes.csv' })).toBe('csv');
    expect(getDocumentReadingStrategy({ mimeType: 'application/vnd.ms-excel', name: 'viejo.xls' })).toBe('legacy_xls');
    expect(getDocumentReadingStrategy({ mimeType: 'image/jpeg', name: 'ticket.jpg' })).toBe('image');
    expect(getDocumentReadingStrategy({ mimeType: 'application/pdf', name: 'factura.pdf' })).toBe('text');
  });

  test('a table is shown with its spreadsheet row numbers and column letters, and says where to read on', () => {
    const sheet = { name: 'Clientes', rows: [['Nombre', 'NIF'], ['Acme | Iberia', 'B1'], ['Línea\ndoble', ''], ['Otro', 'B3']] };
    const slice = sliceSheet({ sheet, fromRow: 2, maxRows: 2 });

    expect(slice).toMatchObject({ rowCount: 4, columnCount: 2, fromRow: 2, hasMore: true });
    expect(formatTableSlice({ slice })).toBe([
      'Sheet "Clientes": 4 rows x 2 columns, rows 2-3 shown',
      '| # | A | B |',
      '|---|---|---|',
      '| 2 | Acme \\| Iberia | B1 |',
      '| 3 | Línea / doble |  |',
      '(more rows: read from row 4)',
    ].join('\n'));
  });

  test('a long text is cut and says from where to read the rest', () => {
    expect(sliceText({ text: 'abcdef', fromChar: 2, maxChars: 3 })).toEqual({ text: 'cde', totalChars: 6, fromChar: 2, hasMore: true });

    const formatted = formatDocumentContentForModel({ document: { id: 'doc_1', name: 'contrato.pdf', mimeType: 'application/pdf' }, content: { kind: 'text', text: 'abc', totalChars: 10, fromChar: 0, hasMore: true } });
    expect(formatted).toContain('documentId: doc_1');
    expect(formatted).toContain('read the rest from character 3');
  });

  test('an unreadable file still tells the model which file and why', () => {
    expect(formatDocumentContentForModel({ document: { id: 'doc_2', name: 'viejo.xls', mimeType: 'application/vnd.ms-excel' }, content: { kind: 'unreadable', reason: 'old binary Excel format' } }))
      .toBe('[File "viejo.xls" (application/vnd.ms-excel), documentId: doc_2]\nIt could not be read: old binary Excel format');
  });

  test('several attached files share the inline room, never below a useful minimum', () => {
    expect(getInlineBudget({ attachmentCount: 1, maxChars: 30_000, maxRows: 150 })).toEqual({ maxChars: 30_000, maxRows: 150 });
    expect(getInlineBudget({ attachmentCount: 3, maxChars: 30_000, maxRows: 150 })).toEqual({ maxChars: 15_000, maxRows: 75 });
    expect(getInlineBudget({ attachmentCount: 10, maxChars: 30_000, maxRows: 150 })).toEqual({ maxChars: 5_454, maxRows: 30 });
  });
});
