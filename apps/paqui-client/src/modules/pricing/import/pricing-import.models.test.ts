import type { PricingImportProposal } from './pricing-import.types';
import { describe, expect, test } from 'vitest';
import { buildImportInput, getConceptKey, getDefaultDecisions, getDefaultPriceListName, getProductPreview, SKIP_PRODUCT } from './pricing-import.models';

const proposal: PricingImportProposal = {
  fileName: 'Escandallos 2026.xlsx',
  detectedWith: 'ai',
  warnings: [],
  shippingRates: [],
  priceLists: [],
  blocks: [
    {
      id: 'b1',
      sheetName: 'Hoja 1',
      title: null,
      headerRow: 3,
      concepts: [{ row: 5, name: 'Carcasa', kind: 'cost' }, { row: 6, name: 'Porte', kind: 'shipping' }, { row: 7, name: 'Representante', kind: 'commission' }, { row: 8, name: 'Descuento', kind: 'cost' }],
      products: [
        { key: 'b1-B', column: 'B', name: 'Owen (Pata madera)', baseName: 'Owen', variant: 'Pata madera', amounts: [12_000, 2_500, 1_800, -500], linesTotalMinor: 15_800, costMinor: 15_800, priceMinor: 32_000, marginMinor: 16_200, matchedProduct: null },
        { key: 'b1-C', column: 'C', name: 'Luna', baseName: 'Luna', variant: null, amounts: [9_500, 0, 1_500, 0], linesTotalMinor: 11_000, costMinor: 11_000, priceMinor: null, marginMinor: null, matchedProduct: { id: 'prd_luna', name: 'Luna' } },
      ],
      issues: [],
      isBalanced: true,
    },
    {
      id: 'b2',
      sheetName: 'Hoja 1',
      title: null,
      headerRow: 15,
      concepts: [{ row: 16, name: 'Estructura', kind: 'cost' }],
      products: [{ key: 'b2-B', column: 'B', name: 'Nora', baseName: 'Nora', variant: null, amounts: [6_000], linesTotalMinor: 6_000, costMinor: 6_500, priceMinor: 18_000, marginMinor: 11_500, matchedProduct: null }],
      issues: [{ code: 'cost_mismatch', productKey: 'b2-B', expectedMinor: 6_500, actualMinor: 6_000 }],
      isBalanced: false,
    },
  ],
};

describe('pricing import models', () => {
  test('by default the balanced blocks are imported, shipping rows go to shipping, commissions are left out and matched products are updated', () => {
    const decisions = getDefaultDecisions({ proposal });

    expect([...decisions.includedBlockIds]).to.eql(['b1']);
    expect(decisions.treatments).to.eql({ 'b1:0': 'cost', 'b1:1': 'shipping', 'b1:2': 'skip', 'b1:3': 'cost', 'b2:0': 'cost' });
    expect(decisions.productTargets).to.eql({ 'b1-B': '', 'b1-C': 'prd_luna', 'b2-B': '' });
  });

  test('the preview margin subtracts the breakdown and the shipping, never negative lines nor what is left out', () => {
    const preview = getProductPreview({ block: proposal.blocks[0]!, product: proposal.blocks[0]!.products[0]!, treatments: getDefaultDecisions({ proposal }).treatments });

    expect(preview).to.eql({
      costLines: [{ conceptName: 'Carcasa', amountMinor: 12_000 }],
      costMinor: 12_000,
      shipping: { name: 'Porte', amountMinor: 2_500 },
      skippedMinor: 1_800,
      priceMinor: 32_000,
      marginMinor: 17_500,
    });
  });

  test('the confirmation carries the products of the ticked blocks with the decisions taken in the preview', () => {
    const defaults = getDefaultDecisions({ proposal });
    const decisions = {
      includedBlockIds: new Set(['b1', 'b2']),
      treatments: { ...defaults.treatments, [getConceptKey({ blockId: 'b1', index: 2 })]: 'cost' as const },
      productTargets: { ...defaults.productTargets, 'b2-B': SKIP_PRODUCT },
    };

    expect(buildImportInput({ proposal, decisions, priceList: { mode: 'new', name: ' Tarifa 2026 ' } })).to.eql({
      priceList: { mode: 'new', name: 'Tarifa 2026' },
      products: [
        { productId: null, name: 'Owen (Pata madera)', costLines: [{ conceptName: 'Carcasa', amountMinor: 12_000 }, { conceptName: 'Representante', amountMinor: 1_800 }], priceMinor: 32_000, shipping: { name: 'Porte', amountMinor: 2_500 } },
        { productId: 'prd_luna', name: 'Luna', costLines: [{ conceptName: 'Carcasa', amountMinor: 9_500 }, { conceptName: 'Representante', amountMinor: 1_500 }], priceMinor: null, shipping: null },
      ],
    });
    expect(buildImportInput({ proposal, decisions, priceList: { mode: 'none' } }).priceList).to.eql(null);
  });

  test('the new price list is named after the file', () => {
    expect(getDefaultPriceListName({ fileName: 'Escandallos 2026.xlsx' })).to.eql('Escandallos 2026');
  });
});
