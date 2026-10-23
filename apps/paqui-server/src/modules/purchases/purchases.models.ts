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
