import type { z } from 'zod';
import type { purchaseInvoiceDraftSchema } from './purchases.schemas';
import type { purchaseInvoiceItemsTable, purchaseInvoicesTable } from './purchases.tables';
import { calculateInvoiceTotals } from '../invoicing/invoicing.models';

export type PurchaseInvoiceDraftInput = z.infer<typeof purchaseInvoiceDraftSchema>;
export type PurchaseInvoice = typeof purchaseInvoicesTable.$inferSelect;
export type PurchaseInvoiceItem = typeof purchaseInvoiceItemsTable.$inferSelect;

// Same amounts as an issued invoice (so both sides round identically), plus the deductible part of the VAT
export function calculatePurchaseInvoiceTotals({ items, withholdingRateBps }: Pick<PurchaseInvoiceDraftInput, 'items' | 'withholdingRateBps'>) {
  const totals = calculateInvoiceTotals({ items, withholdingRateBps });

  const deductibleTaxMinor = items.reduce((sum, item) => {
    const gross = Math.round(item.quantityMillis * item.unitPriceMinor / 1_000);
    const netMinor = gross - Math.round(gross * item.discountRateBps / 10_000);
    const taxMinor = Math.round(netMinor * item.taxRateBps / 10_000);

    return sum + Math.round(taxMinor * item.deductibleRateBps / 10_000);
  }, 0);

  return { ...totals, deductibleTaxMinor };
}
