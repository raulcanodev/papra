import type { z } from 'zod';
import type { fiscalProfileSchema, invoiceBrandingSchema, invoiceDraftSchema, invoiceSeriesSchema, productSchema, taxRateSchema } from './invoicing.schemas';

export type FiscalProfileInput = z.infer<typeof fiscalProfileSchema>;
export type InvoiceDraftInput = z.infer<typeof invoiceDraftSchema>;
export type ProductInput = z.infer<typeof productSchema>;
export type TaxRateInput = z.infer<typeof taxRateSchema>;
export type InvoiceSeriesInput = z.infer<typeof invoiceSeriesSchema>;
export type InvoiceBrandingInput = z.infer<typeof invoiceBrandingSchema>;

// Amounts of one line, rounded to the cent line by line: the single place every total (invoices, purchases, taxes) comes from
export function getLineAmounts(item: Pick<InvoiceDraftInput['items'][number], 'quantityMillis' | 'unitPriceMinor' | 'discountRateBps' | 'taxRateBps'>) {
  const gross = Math.round(item.quantityMillis * item.unitPriceMinor / 1_000);
  const netMinor = gross - Math.round(gross * item.discountRateBps / 10_000);
  const taxMinor = Math.round(netMinor * item.taxRateBps / 10_000);

  return { netMinor, taxMinor };
}

export function calculateInvoiceTotals({ items, withholdingRateBps }: Pick<InvoiceDraftInput, 'items' | 'withholdingRateBps'>) {
  const totals = items.reduce((sums, item) => {
    const { netMinor, taxMinor } = getLineAmounts(item);

    return {
      subtotalMinor: sums.subtotalMinor + netMinor,
      taxMinor: sums.taxMinor + taxMinor,
      totalMinor: sums.totalMinor + netMinor + taxMinor,
    };
  }, { subtotalMinor: 0, taxMinor: 0, totalMinor: 0 });

  // The withholding is computed on the taxable base, not on the total with VAT
  const withholdingMinor = Math.round(totals.subtotalMinor * withholdingRateBps / 10_000);

  return { ...totals, withholdingRateBps, withholdingMinor };
}

// What the customer actually pays the issuer: the total minus the withholding it pays to the tax agency instead
export function getInvoicePayableMinor({ totalMinor, withholdingMinor }: { totalMinor: number; withholdingMinor: number }) {
  return totalMinor - withholdingMinor;
}

export function formatInvoiceNumber({ prefix, nextNumber, padding }: { prefix: string; nextNumber: number; padding: number }) {
  return `${prefix}${String(nextNumber).padStart(padding, '0')}`;
}
