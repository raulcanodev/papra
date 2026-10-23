import { describe, expect, test } from 'vitest';
import { findHeaderRow, getDataRows, mapColumnsWithRules, sanitizeMapping } from './data-imports.models';

describe('data imports models', () => {
  describe('findHeaderRow', () => {
    test('exports often start with a title and a date: the header is the row with the most text cells', () => {
      const sheet = { name: 'Clientes', rows: [
        ['Listado de clientes', '', '', ''],
        ['01/10/2026', '', '', ''],
        ['Código', 'Razón social', 'CIF', 'Población'],
        ['1', 'Ferretería Pérez SL', 'B12345678', 'Murcia'],
      ] };

      expect(findHeaderRow({ sheet })).to.eql(3);
    });
  });

  describe('mapColumnsWithRules', () => {
    test('the usual names of a Spanish export are recognized, exact names before the ones containing the word', () => {
      expect(mapColumnsWithRules({ entity: 'contacts', headers: ['Código', 'Razón social', 'Nombre comercial', 'C.I.F.', 'Teléfono fijo', 'E-mail', 'C.P.', 'Provincia'] })).to.eql([
        null,
        'name',
        null,
        'taxId',
        'phone',
        'email',
        'postalCode',
        'region',
      ]);
    });

    test('a product description column is the name when there is no other name', () => {
      expect(mapColumnsWithRules({ entity: 'products', headers: ['Ref.', 'Descripción', 'PVP', '% IVA'] })).to.eql([null, 'name', 'unitPrice', 'taxRate']);
    });
  });

  describe('sanitizeMapping', () => {
    test('each field fills one column, the first one, and unknown fields are left out', () => {
      expect(sanitizeMapping({ entity: 'products', mapping: ['name', 'name', 'taxId' as never, 'unitPrice'], columnCount: 5 })).to.eql(['name', null, null, 'unitPrice', null]);
    });
  });

  describe('getDataRows', () => {
    test('the rows under the header, empty ones left out, as wide as the header', () => {
      const sheet = { name: 'S', rows: [['Nombre', 'NIF'], ['A', 'B1'], ['', ''], ['C', 'D2', 'extra']] };

      expect(getDataRows({ sheet, headerRow: 1, maxRows: 10 })).to.eql({ rows: [['A', 'B1'], ['C', 'D2']], isTruncated: false });
      expect(getDataRows({ sheet, headerRow: 1, maxRows: 1 })).to.eql({ rows: [['A', 'B1']], isTruncated: true });
    });
  });
});
