import type { DataImportProposal } from './data-imports.types';
import { describe, expect, test } from 'vitest';
import { buildContactRows, buildProductRows, getContactKind, parseCellNumber, parseTaxRateBps, setColumnField, summarizeRows } from './data-imports.models';

function proposal(overrides: Partial<DataImportProposal>): DataImportProposal {
  return {
    entity: 'contacts',
    fileName: 'agenda.csv',
    detectedWith: 'ai',
    warnings: [],
    sheets: [],
    sheetName: 'CSV',
    headerRow: 1,
    headers: [],
    rows: [],
    mapping: [],
    existing: [],
    ...overrides,
  };
}

describe('data imports models', () => {
  test('numbers and VAT rates are read the way the spreadsheets write them', () => {
    expect([parseCellNumber('1.234,56 €'), parseCellNumber('1,234.56'), parseCellNumber('12,5'), parseCellNumber('abc')]).to.eql([1234.56, 1234.56, 12.5, null]);
    expect([parseTaxRateBps('21'), parseTaxRateBps('21%'), parseTaxRateBps('0.21'), parseTaxRateBps('10,5'), parseTaxRateBps('IVA')]).to.eql([2100, 2100, 2100, 1050, null]);
  });

  test('a DNI or NIE is a person, any other tax id a company', () => {
    expect([getContactKind({ taxId: '12345678Z' }), getContactKind({ taxId: 'X-1234567-L' }), getContactKind({ taxId: 'B12345678' }), getContactKind({ taxId: null })]).to.eql(['person', 'person', 'company', 'company']);
  });

  test('contacts are matched to the existing ones by tax id, then by name; repeated and nameless rows are skipped', () => {
    const rows = buildContactRows({
      existingPolicy: 'update',
      mapping: ['name', 'taxId', 'email'],
      proposal: proposal({
        rows: [
          ['Ferretería Pérez', 'ES B-1234 5678', 'compras@perez.es'],
          ['Ferreteria Perez', 'B12345678', ''],
          ['', 'A11111111', ''],
          ['Talleres Gómez', '', 'no-email'],
          ['Juan García', '22222222J', ''],
        ],
        existing: [
          { id: 'ctc_1', name: 'Ferretería Pérez S.L.', taxId: 'B12345678' },
          { id: 'ctc_2', name: 'Talleres Gómez', taxId: null },
          // A namesake with another tax id is another person
          { id: 'ctc_3', name: 'Juan García', taxId: '33333333P' },
        ],
      }),
    });

    expect(rows.map(row => [row.status, row.issues, row.record.existingContactId])).to.eql([
      ['update', [], 'ctc_1'],
      ['skip', ['duplicate_in_file'], null],
      ['skip', ['missing_name'], null],
      ['update', ['invalid_email'], 'ctc_2'],
      ['create', [], null],
    ]);
    expect(rows[3]!.record.email).to.eql(null);
    expect(summarizeRows(rows)).to.eql({ create: 1, update: 2, skip: 2 });
  });

  test('existing products can be left as they are', () => {
    const rows = buildProductRows({
      existingPolicy: 'skip',
      mapping: ['name', 'unitPrice', 'taxRate'],
      proposal: proposal({ entity: 'products', rows: [['Tornillo M6', '0,15', '21'], ['Arandela', 'gratis', '']], existing: [{ id: 'prd_1', name: 'tornillo m6', taxId: null }] }),
    });

    expect(rows.map(row => [row.status, row.issues, row.record.unitPriceMinor, row.record.taxRateBps])).to.eql([
      ['skip', [], 15, 2100],
      ['create', ['invalid_price'], null, null],
    ]);
  });

  test('a field picked for a column is taken away from the column that had it', () => {
    expect(setColumnField({ mapping: ['name', null, 'city'], column: 1, field: 'name' })).to.eql([null, 'name', 'city']);
  });
});
