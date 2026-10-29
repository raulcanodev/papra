import type { z } from 'zod';
import type { purchaseInvoiceDraftSchema } from './purchases.schemas';
import type { purchaseInvoiceItemsTable, purchaseInvoicesTable } from './purchases.tables';
import { calculateInvoiceTotals, getLineAmounts } from '../invoicing/invoicing.models';

export type PurchaseInvoiceDraftInput = z.infer<typeof purchaseInvoiceDraftSchema>;
export type PurchaseInvoice = typeof purchaseInvoicesTable.$inferSelect;
export type PurchaseInvoiceItem = typeof purchaseInvoiceItemsTable.$inferSelect;

// Same amounts as an issued invoice (so both sides round identically), plus the deductible part of the VAT
export function calculatePurchaseInvoiceTotals({ items, withholdingRateBps }: Pick<PurchaseInvoiceDraftInput, 'items' | 'withholdingRateBps'>) {
  // The equivalence surcharge of a received invoice is not tracked on purchases yet
  const { equivalenceSurchargeMinor: _equivalenceSurchargeMinor, ...totals } = calculateInvoiceTotals({ items, withholdingRateBps });

  const deductibleTaxMinor = items.reduce((sum, item) => sum + Math.round(getLineAmounts(item).taxMinor * item.deductibleRateBps / 10_000), 0);

  return { ...totals, deductibleTaxMinor };
}

// A unit price as printed: in cents, and also in millionths when it goes beyond the cent (0,365 €), so the line still
// adds up to the printed amount (400 × 0,365 € = 146,00 €, not 400 × 0,37 € = 148,00 €)
export function toPurchaseUnitPrice({ amount }: { amount: number }) {
  const unitPriceMicros = Math.max(0, Math.round(amount * 1_000_000));

  return {
    unitPriceMinor: Math.round(unitPriceMicros / 10_000),
    unitPriceMicros: unitPriceMicros % 10_000 === 0 ? null : unitPriceMicros,
  };
}
