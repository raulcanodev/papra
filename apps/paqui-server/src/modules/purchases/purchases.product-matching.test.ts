import type { MatchableProduct } from './purchases.product-matching';
import { describe, expect, test } from 'vitest';
import { matchProductByName, matchPurchaseLinesWithProducts } from './purchases.product-matching';

const product = (id: string, name: string): MatchableProduct => ({ id, name, description: null, unit: 'ud', unitPriceMinor: 1_000, currency: 'EUR' });

const products = [
  product('prd_folios', 'Folios A4 (caja de 2.500)'),
  product('prd_toner', 'Tóner negro'),
  product('prd_toner_xl', 'Tóner negro XL'),
];

describe('purchases product matching', () => {
  describe('matchProductByName', () => {
    test('a line carrying the whole name of a product is that product, whatever the accents, case and extra words', () => {
      expect(matchProductByName({ description: 'Folios A4 (caja de 2.500) - ref 88', products })?.id).to.eql('prd_folios');
      expect(matchProductByName({ description: 'TONER NEGRO hp', products })?.id).to.eql('prd_toner');
    });

    test('the longest name wins when several are in the line', () => {
      expect(matchProductByName({ description: 'Toner negro XL', products })?.id).to.eql('prd_toner_xl');
    });

    test('an empty line or one without a whole name is no product', () => {
      expect(matchProductByName({ description: '  ', products })).to.eql(null);
      expect(matchProductByName({ description: 'Tóner color', products })).to.eql(null);
      // Left to the model: "2500" is not "2.500" word by word
      expect(matchProductByName({ description: 'FOLIOS A4 caja de 2500', products })).to.eql(null);
    });
  });

  describe('matchPurchaseLinesWithProducts', () => {
    test('the model is only asked about the lines the names leave open, and only its answers on products of the supplier are kept', async () => {
      const asked: unknown[] = [];

      const { matches, isModelUnavailable } = await matchPurchaseLinesWithProducts({
        descriptions: ['Tóner negro', 'Folio A4 80g cj2500', 'Portes', 'Grapas', ''],
        products,
        matchWithModel: async ({ lines }) => {
          asked.push(...lines);
          return [
            { index: 1, productId: 'prd_folios' },
            { index: 2, productId: null },
            { index: 3, productId: 'prd_other_supplier' },
            { index: 0, productId: 'prd_toner_xl' },
          ];
        },
      });

      expect(asked).to.eql([{ index: 1, description: 'Folio A4 80g cj2500' }, { index: 2, description: 'Portes' }, { index: 3, description: 'Grapas' }]);
      expect(isModelUnavailable).to.eql(false);
      expect(matches).to.eql([
        { productId: 'prd_toner', matchedBy: 'name' },
        { productId: 'prd_folios', matchedBy: 'ai' },
        { productId: null, matchedBy: null },
        { productId: null, matchedBy: null },
        { productId: null, matchedBy: null },
      ]);
    });

    test('a supplier without products does not call the model', async () => {
      const { matches, isModelUnavailable } = await matchPurchaseLinesWithProducts({
        descriptions: ['Grapas'],
        products: [],
        matchWithModel: async () => {
          throw new Error('Not expected');
        },
      });

      expect(matches).to.eql([{ productId: null, matchedBy: null }]);
      expect(isModelUnavailable).to.eql(false);
    });

    test('without the model, or when it fails, the matches by name are still given', async () => {
      const withoutModel = await matchPurchaseLinesWithProducts({ descriptions: ['Tóner negro', 'Grapas'], products });
      const failing = await matchPurchaseLinesWithProducts({
        descriptions: ['Tóner negro', 'Grapas'],
        products,
        matchWithModel: async () => {
          throw new Error('Model down');
        },
      });

      for (const result of [withoutModel, failing]) {
        expect(result.isModelUnavailable).to.eql(true);
        expect(result.matches).to.eql([{ productId: 'prd_toner', matchedBy: 'name' }, { productId: null, matchedBy: null }]);
      }
    });
  });
});
