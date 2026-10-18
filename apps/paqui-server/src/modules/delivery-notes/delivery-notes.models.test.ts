import { describe, expect, test } from 'vitest';
import { buildInvoiceFromDeliveryNotes, buildWrittenTextAliases, formatNextDeliveryNoteNumber, normalizeWrittenText } from './delivery-notes.models';
import { toDeliveryNoteProposal } from './delivery-notes.reading';

describe('delivery-notes models', () => {
  describe('normalizeWrittenText', () => {
    test('handwritten texts are compared without case, accents nor punctuation', () => {
      expect(normalizeWrittenText({ text: '  Tom. Pera  (cajá)' })).to.eql('tom pera caja');
      expect(normalizeWrittenText({ text: 'Piñones-1kg' })).to.eql('pinones 1kg');
    });
  });

  describe('buildWrittenTextAliases', () => {
    test('the most recent product confirmed for a text wins, texts without product are ignored', () => {
      const aliases = buildWrittenTextAliases({ items: [
        { writtenText: 'Tom pera', productId: 'prd_new' },
        { writtenText: 'tom. pera', productId: 'prd_old' },
        { writtenText: 'lechuga', productId: null },
        { writtenText: null, productId: 'prd_x' },
      ] });

      expect([...aliases.entries()]).to.eql([['tom pera', 'prd_new']]);
    });
  });

  describe('formatNextDeliveryNoteNumber', () => {
    test('the next number follows the highest one, on four digits at least', () => {
      expect(formatNextDeliveryNoteNumber({ highestNumber: 0 })).to.eql('0001');
      expect(formatNextDeliveryNoteNumber({ highestNumber: 41 })).to.eql('0042');
      expect(formatNextDeliveryNoteNumber({ highestNumber: 12_345 })).to.eql('12346');
    });
  });

  describe('buildInvoiceFromDeliveryNotes', () => {
    const pricing = {
      products: [{ id: 'prd_tomato', unitPriceMinor: 900, taxRateBps: 400 }, { id: 'prd_lettuce', unitPriceMinor: 80, taxRateBps: 400 }],
      priceList: { discountRateBps: 500, prices: [{ productId: 'prd_tomato', priceMinor: 850 }] },
      defaultTaxRateBps: 2_100,
    };

    test('the same product adds up on one line, priced with the customer price list or else the catalog, the reference lists the delivery notes by date', () => {
      const { items, reference } = buildInvoiceFromDeliveryNotes({
        pricing,
        formatDate: date => date.toISOString().slice(0, 10),
        deliveryNotes: [
          { number: '0042', date: new Date('2026-10-14T00:00:00.000Z'), items: [
            { productId: 'prd_tomato', description: 'Tomate pera', quantityMillis: 2_000 },
            { productId: 'prd_lettuce', description: 'Lechuga', quantityMillis: 10_000 },
          ] },
          { number: null, date: new Date('2026-10-02T00:00:00.000Z'), items: [
            { productId: 'prd_tomato', description: 'Tomate pera', quantityMillis: 3_000 },
            { productId: null, description: 'Portes', quantityMillis: 1_000 },
          ] },
        ],
      });

      expect(items).to.eql([
        { productId: 'prd_tomato', description: 'Tomate pera', quantityMillis: 5_000, unitPriceMinor: 850, taxRateBps: 400, discountRateBps: 500 },
        { productId: null, description: 'Portes', quantityMillis: 1_000, unitPriceMinor: 0, taxRateBps: 2_100, discountRateBps: 0 },
        { productId: 'prd_lettuce', description: 'Lechuga', quantityMillis: 10_000, unitPriceMinor: 80, taxRateBps: 400, discountRateBps: 0 },
      ]);
      expect(reference).to.eql('2026-10-02, 0042 (2026-10-14)');
    });

    test('a product removed from the catalog since is invoiced as a line to price by hand', () => {
      const { items } = buildInvoiceFromDeliveryNotes({
        pricing: { ...pricing, priceList: null },
        formatDate: date => date.toISOString(),
        deliveryNotes: [{ number: '1', date: new Date('2026-10-14T00:00:00.000Z'), items: [{ productId: 'prd_gone', description: 'Pimiento', quantityMillis: 1_000 }] }],
      });

      expect(items).to.eql([{ productId: null, description: 'Pimiento', quantityMillis: 1_000, unitPriceMinor: 0, taxRateBps: 2_100, discountRateBps: 0 }]);
    });
  });

  describe('toDeliveryNoteProposal', () => {
    const refs = new Map([['prd_tomato', 'P1'], ['prd_lettuce', 'P2'], ['prd_onion', 'P3']]);
    const reading = {
      customer: { name: 'Bar Pepe', taxId: null },
      number: ' 0042 ',
      date: '2026-10-14',
      warnings: [],
      lines: [
        { writtenText: 'Tom. pera', quantity: 3, productRef: 'P2', alternativeRefs: ['P1'], confidence: 'low' as const },
        { writtenText: 'cebolla', quantity: 0.5, productRef: 'p3', alternativeRefs: ['P9', 'P3'], confidence: 'medium' as const },
        { writtenText: 'algo ilegible', quantity: 0, productRef: null, alternativeRefs: [], confidence: 'low' as const },
        { writtenText: '  ', quantity: 1, productRef: null, alternativeRefs: [], confidence: 'low' as const },
      ],
    };

    test('a text confirmed in a past delivery note wins over the reading, unknown refs are dropped', () => {
      const proposal = toDeliveryNoteProposal({ reading, refs, aliases: new Map([['tom pera', 'prd_tomato']]) });

      expect(proposal.number).to.eql('0042');
      expect(proposal.date).to.eql(new Date('2026-10-14T00:00:00.000Z'));
      expect(proposal.lines).to.eql([
        { writtenText: 'Tom. pera', quantityMillis: 3_000, productId: 'prd_tomato', matchedBy: 'memory', confidence: 'high', alternativeProductIds: ['prd_lettuce'] },
        { writtenText: 'cebolla', quantityMillis: 500, productId: 'prd_onion', matchedBy: 'reading', confidence: 'medium', alternativeProductIds: [] },
        { writtenText: 'algo ilegible', quantityMillis: 1_000, productId: null, matchedBy: null, confidence: 'low', alternativeProductIds: [] },
      ]);
    });
  });
});
