import type { z } from 'zod';
import type { fiscalProfileSchema, invoiceBrandingSchema, invoiceDraftSchema, invoiceSeriesSchema, productSchema, taxRateSchema } from './invoicing.schemas';

export type FiscalProfileInput = z.infer<typeof fiscalProfileSchema>;
export type InvoiceDraftInput = z.infer<typeof invoiceDraftSchema>;
export type ProductInput = z.infer<typeof productSchema>;
export type TaxRateInput = z.infer<typeof taxRateSchema>;
export type InvoiceSeriesInput = z.infer<typeof invoiceSeriesSchema>;
export type InvoiceBrandingInput = z.infer<typeof invoiceBrandingSchema>;

// Amounts of one line, rounded to the cent line by line: the single place every total (invoices, purchases, taxes) comes from
// The fixed discount (invoices only, purchases have none) comes off after the percentage one and can take the line below
// zero: a negative line takes that amount off the rest of the invoice
export function getLineAmounts(item: Pick<InvoiceDraftInput['items'][number], 'quantityMillis' | 'unitPriceMinor' | 'discountRateBps' | 'taxRateBps'> & { discountMinor?: number }) {
  const gross = Math.round(item.quantityMillis * item.unitPriceMinor / 1_000);
  const afterRate = gross - Math.round(gross * item.discountRateBps / 10_000);
  const netMinor = afterRate - (item.discountMinor ?? 0);
  const taxMinor = Math.round(netMinor * item.taxRateBps / 10_000);

  return { netMinor, taxMinor };
}

// Equivalence surcharge (recargo de equivalencia) charged on top of each VAT rate to a retailer under that regime
// (Ley 37/1992, art. 161). A VAT rate missing here, an exempt line for instance, carries no surcharge.
const EQUIVALENCE_SURCHARGE_RATES_BPS: Record<number, number> = { 2_100: 520, 1_000: 140, 500: 62, 400: 50, 200: 26 };

export function getEquivalenceSurchargeRateBps({ taxRateBps }: { taxRateBps: number }) {
  return EQUIVALENCE_SURCHARGE_RATES_BPS[taxRateBps] ?? 0;
}

// The surcharge of one line, on the same taxable base as its VAT and rounded to the cent like it
export function getLineEquivalenceSurchargeMinor({ netMinor, taxRateBps }: { netMinor: number; taxRateBps: number }) {
  return Math.round(netMinor * getEquivalenceSurchargeRateBps({ taxRateBps }) / 10_000);
}

export function calculateInvoiceTotals({ items, withholdingRateBps, equivalenceSurcharge = false }: Pick<InvoiceDraftInput, 'items' | 'withholdingRateBps'> & { equivalenceSurcharge?: boolean }) {
  const totals = items.reduce((sums, item) => {
    const { netMinor, taxMinor } = getLineAmounts(item);
    const surchargeMinor = equivalenceSurcharge ? getLineEquivalenceSurchargeMinor({ netMinor, taxRateBps: item.taxRateBps }) : 0;

    return {
      subtotalMinor: sums.subtotalMinor + netMinor,
      taxMinor: sums.taxMinor + taxMinor,
      equivalenceSurchargeMinor: sums.equivalenceSurchargeMinor + surchargeMinor,
      totalMinor: sums.totalMinor + netMinor + taxMinor + surchargeMinor,
    };
  }, { subtotalMinor: 0, taxMinor: 0, equivalenceSurchargeMinor: 0, totalMinor: 0 });

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
