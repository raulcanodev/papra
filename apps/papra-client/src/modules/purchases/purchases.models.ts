import type { PurchaseInvoiceItemInput } from './purchases.types';

// Mirrors the server purchases models: same rounding line by line, so the preview matches what is saved
export function calculatePurchaseInvoiceTotals({ items, withholdingRateBps }: { items: PurchaseInvoiceItemInput[]; withholdingRateBps: number }) {
  const totals = items.reduce((sums, item) => {
    const gross = Math.round(item.quantityMillis * item.unitPriceMinor / 1_000);
    const netMinor = gross - Math.round(gross * item.discountRateBps / 10_000);
    const taxMinor = Math.round(netMinor * item.taxRateBps / 10_000);

    return {
      subtotalMinor: sums.subtotalMinor + netMinor,
      taxMinor: sums.taxMinor + taxMinor,
      deductibleTaxMinor: sums.deductibleTaxMinor + Math.round(taxMinor * item.deductibleRateBps / 10_000),
    };
  }, { subtotalMinor: 0, taxMinor: 0, deductibleTaxMinor: 0 });

  const totalMinor = totals.subtotalMinor + totals.taxMinor;
  const withholdingMinor = Math.round(totals.subtotalMinor * withholdingRateBps / 10_000);

  return { ...totals, totalMinor, withholdingMinor, payableMinor: totalMinor - withholdingMinor };
}

export function emptyPurchaseInvoiceItem(taxRateBps = 2_100): PurchaseInvoiceItemInput {
  return { description: '', quantityMillis: 1_000, unitPriceMinor: 0, taxRateBps, discountRateBps: 0, deductibleRateBps: 10_000 };
}
