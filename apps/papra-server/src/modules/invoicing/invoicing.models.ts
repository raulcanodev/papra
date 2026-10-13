import type { z } from 'zod';
import type { customerSchema, fiscalProfileSchema, invoiceBrandingSchema, invoiceDraftSchema, invoiceSeriesSchema, productSchema, salesRepresentativeSchema, taxRateSchema } from './invoicing.schemas';

export type FiscalProfileInput = z.infer<typeof fiscalProfileSchema>;
export type CustomerInput = z.infer<typeof customerSchema>;
export type InvoiceDraftInput = z.infer<typeof invoiceDraftSchema>;
export type ProductInput = z.infer<typeof productSchema>;
export type TaxRateInput = z.infer<typeof taxRateSchema>;
export type SalesRepresentativeInput = z.infer<typeof salesRepresentativeSchema>;
export type InvoiceSeriesInput = z.infer<typeof invoiceSeriesSchema>;
export type InvoiceBrandingInput = z.infer<typeof invoiceBrandingSchema>;

export function calculateInvoiceTotals(items: InvoiceDraftInput['items']) {
  return items.reduce((totals, item) => {
    const gross = Math.round(item.quantityMillis * item.unitPriceMinor / 1_000);
    const discountMinor = Math.round(gross * item.discountRateBps / 10_000);
    const netMinor = gross - discountMinor;
    const taxMinor = Math.round(netMinor * item.taxRateBps / 10_000);

    return {
      subtotalMinor: totals.subtotalMinor + netMinor,
      taxMinor: totals.taxMinor + taxMinor,
      totalMinor: totals.totalMinor + netMinor + taxMinor,
    };
  }, { subtotalMinor: 0, taxMinor: 0, totalMinor: 0 });
}

export function formatInvoiceNumber({ prefix, nextNumber, padding }: { prefix: string; nextNumber: number; padding: number }) {
  return `${prefix}${String(nextNumber).padStart(padding, '0')}`;
}
