import { describe, expect, test } from 'vitest';
import { toSheetRows } from './pricing-import.fixtures';
import { detectLayoutWithRules, findMatchingProduct, formatSheetForModel, guessRowRoles, parseSheetNumber, readBlocks, sanitizeLayout } from './pricing-import.models';

const sheet = { name: 'Escandallos', rows: toSheetRows() };

describe('pricing import models', () => {
  test('numbers are read as spreadsheets and Spanish CSV files write them, percentages and text are not amounts', () => {
    expect(['45.5', '1.234,56', '12,5 €', '1,234.56', '-3', '1.234.567', '0'].map(parseSheetNumber)).to.eql([45.5, 1234.56, 12.5, 1234.56, -3, 1234567, 0]);
    expect(['35%', 'Owen', '', '12 cm', '-'].map(parseSheetNumber)).to.eql([null, null, null, null, null]);
  });

  test('the model reads each non empty cell with its reference', () => {
    expect(formatSheetForModel({ sheet: { name: 'S', rows: [['Modelo:', 'Owen', ''], ['', '', ''], ['Tela', '45.5', '38']] }, maxRows: 10, maxColumns: 10 })).to.eql('### Sheet "S" (3 rows)\n1: A=Modelo: | B=Owen\n3: A=Tela | B=45.5 | C=38');
  });

  test('without a model, the blocks, their variants under a merged header and the role of each row are found by their layout', () => {
    const { blocks } = detectLayoutWithRules({ sheet });

    expect(blocks).to.eql([
      {
        title: 'Tarifa 2026',
        headerRow: 3,
        variantRow: 4,
        labelColumn: 0,
        productColumns: [1, 2, 3],
        rows: [
          { row: 5, role: 'cost_line' },
          { row: 6, role: 'cost_line' },
          { row: 7, role: 'cost_line' },
          { row: 8, role: 'shipping' },
          { row: 9, role: 'commission' },
          { row: 10, role: 'total_cost' },
          { row: 11, role: 'selling_price' },
          { row: 12, role: 'margin' },
        ],
      },
      {
        title: null,
        headerRow: 15,
        variantRow: null,
        labelColumn: 0,
        productColumns: [1, 2],
        rows: [
          { row: 16, role: 'cost_line' },
          { row: 17, role: 'cost_line' },
          { row: 18, role: 'shipping' },
          { row: 19, role: 'total_cost' },
          { row: 20, role: 'selling_price' },
          { row: 21, role: 'margin' },
        ],
      },
    ]);
  });

  test('a total with an unknown label is the row adding the lines above it', () => {
    const values = [[1_000], [500], [1_500], [2_000]].map(([value]) => [null, value!]);
    expect(guessRowRoles({ labels: ['Pieza A', 'Pieza B', 'Suma', 'Precio venta'], values, columns: [1] })).to.eql(['cost_line', 'cost_line', 'total_cost', 'selling_price']);
  });

  test('the figures are read from the cells, and a block whose lines do not add up to its total is flagged', () => {
    const [owen, nora] = readBlocks({ sheet, layout: detectLayoutWithRules({ sheet }) });

    expect(owen!.products.map(({ name, amounts, costMinor, priceMinor, marginMinor }) => ({ name, amounts, costMinor, priceMinor, marginMinor }))).to.eql([
      { name: 'Owen (Pata madera)', amounts: [12_000, 4_550, 800, 2_500, 1_800], costMinor: 21_650, priceMinor: 32_000, marginMinor: 10_350 },
      { name: 'Owen (Pata metal)', amounts: [12_000, 4_550, 800, 2_500, 1_900], costMinor: 21_750, priceMinor: 32_500, marginMinor: 10_750 },
      { name: 'Luna', amounts: [9_500, 3_800, 600, 2_000, 1_500], costMinor: 17_400, priceMinor: 26_000, marginMinor: 8_600 },
    ]);
    expect(owen!.concepts.map(({ name, kind }) => [name, kind])).to.eql([['Carcasa', 'cost'], ['Tela', 'cost'], ['Embalaje', 'cost'], ['Porte', 'shipping'], ['Representante', 'commission']]);
    expect([owen!.isBalanced, owen!.issues]).to.eql([true, []]);

    expect(nora!.isBalanced).to.eql(false);
    expect(nora!.issues).to.eql([{ code: 'cost_mismatch', productKey: 'b2-B', expectedMinor: 11_000, actualMinor: 10_500 }]);
  });

  test('a layout pointing outside the sheet is cleaned instead of trusted', () => {
    const layout = sanitizeLayout({
      sheet: { name: 'S', rows: [['Modelo:', 'A'], ['Tela', '1']] },
      layout: { sheetName: 'S', blocks: [
        { title: null, headerRow: 1, variantRow: 1, labelColumn: 0, productColumns: [1, 1, 0], rows: [{ row: 2, role: 'cost_line' }, { row: 2, role: 'margin' }, { row: 9, role: 'margin' }] },
        { title: null, headerRow: 40, variantRow: null, labelColumn: 0, productColumns: [1], rows: [{ row: 2, role: 'cost_line' }] },
      ] },
    });

    expect(layout.blocks).to.eql([{ title: null, headerRow: 1, variantRow: null, labelColumn: 0, productColumns: [1], rows: [{ row: 2, role: 'cost_line' }] }]);
  });

  test('a catalog product is found by its name, whatever the case, accents or the way the variant is written', () => {
    const products = [{ id: 'p1', name: 'OWEN - pata madera' }, { id: 'p2', name: 'Lúna' }];

    expect(findMatchingProduct({ products, name: 'Owen (Pata madera)', baseName: 'Owen', variant: 'Pata madera' })?.id).to.eql('p1');
    expect(findMatchingProduct({ products, name: 'Luna', baseName: 'Luna', variant: null })?.id).to.eql('p2');
    expect(findMatchingProduct({ products, name: 'Owen (Pata metal)', baseName: 'Owen', variant: 'Pata metal' })).to.eql(null);
  });
});
