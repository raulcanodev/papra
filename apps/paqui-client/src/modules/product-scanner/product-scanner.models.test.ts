import type { ProductScanProposal } from './product-scanner.types';
import { describe, expect, test } from 'vitest';
import { buildCatalogImportInput, formatScanFieldValue } from './product-scanner.models';

const proposal: ProductScanProposal = {
  fields: [
    { ref: 'cpd_1', status: 'existing', name: 'Acabado', type: 'select', description: null, options: [{ id: 'opt_1', name: 'Mate' }] },
    { ref: 'new:colordetela', status: 'new', name: 'Color de tela', type: 'text', description: null, options: [] },
    { ref: 'new:gramaje', status: 'new', name: 'Gramaje', type: 'number', description: null, options: [] },
  ],
  products: [
    { matchesProductId: null, name: 'Lona 600', description: null, unit: 'm', unitPriceMinor: 1250, currency: 'EUR', taxRateBps: 2100, values: { 'cpd_1': 'opt_1', 'new:colordetela': 'azul' } },
    { matchesProductId: null, name: 'Lona 900', description: null, unit: 'm', unitPriceMinor: 1500, currency: 'EUR', taxRateBps: 2100, values: { 'new:gramaje': 900 } },
  ],
  warnings: [],
  unreadableFiles: [],
};

describe('product scanner models', () => {
  test('only the selected products are imported, with the new fields they use and the target the user chose for each', () => {
    expect(buildCatalogImportInput({ proposal, selectedIndexes: new Set([0]), fieldTargets: { 'new:colordetela': 'cpd_2' } })).to.eql({
      newFields: [{ ref: 'new:colordetela', name: 'Color de tela', type: 'text', description: null, existingPropertyDefinitionId: 'cpd_2' }],
      products: [proposal.products[0]],
    });
  });

  test('select values are shown with their option name', () => {
    expect(formatScanFieldValue({ field: proposal.fields[0]!, value: 'opt_1', labels: { yes: 'Sí', no: 'No' } })).to.eql('Mate');
  });
});
