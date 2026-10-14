import type { ExpenseCategory } from './purchases.constants';
import { z } from 'zod';
import { normalizeTaxId } from '../contacts/contacts.models';
import { EXPENSE_CATEGORIES } from './purchases.constants';

const partySchema = z.object({
  name: z.string().describe('Legal or trade name as printed on the invoice'),
  taxId: z.string().nullable().describe('Tax identification number (NIF, CIF, VAT number), exactly as printed, null when absent'),
  email: z.string().nullable(),
  addressLine1: z.string().nullable(),
  postalCode: z.string().nullable(),
  city: z.string().nullable(),
  country: z.string().nullable().describe('ISO 3166-1 alpha-2 country code, e.g. ES'),
});

// What the model is asked to read from the invoice. Amounts as decimals in the invoice currency, converted to minor
// units by the server: models are much more reliable with "12.50" than with "1250 cents".
export const invoiceExtractionSchema = z.object({
  issuer: partySchema.describe('The company or person that issued (sent) the invoice'),
  recipient: partySchema.describe('The company or person the invoice is addressed to'),
  number: z.string().describe('Invoice number'),
  issueDate: z.string().describe('Issue date as YYYY-MM-DD'),
  dueDate: z.string().nullable().describe('Due date as YYYY-MM-DD, null when not printed'),
  currency: z.string().describe('ISO 4217 currency code, e.g. EUR'),
  lines: z.array(z.object({
    description: z.string(),
    quantity: z.number().describe('Quantity, 1 when not printed'),
    unitPrice: z.number().describe('Unit price before tax and before discount'),
    taxRatePercent: z.number().describe('VAT rate in percent, e.g. 21'),
    discountPercent: z.number().describe('Line discount in percent, 0 when none'),
  })).min(1),
  withholdingRatePercent: z.number().describe('IRPF withholding rate in percent, 0 when none'),
  total: z.number().describe('Invoice total, taxes included, as printed'),
  category: z.enum(EXPENSE_CATEGORIES).describe('Best matching expense category for the recipient'),
});

export type InvoiceExtraction = z.infer<typeof invoiceExtractionSchema>;

export type InvoiceDirection = 'received' | 'issued' | 'unknown';

// An invoice issued by the organization itself is a sale, not an expense: detected from the tax ids
export function getInvoiceDirection({ extraction, organizationTaxId }: { extraction: Pick<InvoiceExtraction, 'issuer' | 'recipient'>; organizationTaxId: string | null | undefined }): InvoiceDirection {
  const ownTaxId = normalizeTaxId({ taxId: organizationTaxId });

  if (ownTaxId === null) {
    return 'unknown';
  }

  if (normalizeTaxId({ taxId: extraction.issuer.taxId }) === ownTaxId) {
    return 'issued';
  }

  if (normalizeTaxId({ taxId: extraction.recipient.taxId }) === ownTaxId) {
    return 'received';
  }

  return 'unknown';
}

const toMinor = (amount: number) => Math.round(amount * 100);
const toBps = (percent: number, { max = 100 }: { max?: number } = {}) => Math.round(Math.min(Math.max(percent, 0), max) * 100);

function toDate(value: string | null) {
  if (value === null) {
    return null;
  }

  const date = new Date(`${value.slice(0, 10)}T00:00:00.000Z`);

  return Number.isNaN(date.getTime()) ? null : date;
}

// Converts what the model read into a purchase draft, the user reviews it before saving
export function toPurchaseInvoiceDraft({ extraction, supplierId, documentId }: { extraction: InvoiceExtraction; supplierId: string | null; documentId: string }) {
  const items = extraction.lines.map(line => ({
    description: line.description.trim().slice(0, 500) || '—',
    quantityMillis: Math.max(1, Math.round(line.quantity * 1_000)),
    unitPriceMinor: Math.max(0, toMinor(line.unitPrice)),
    taxRateBps: toBps(line.taxRatePercent),
    discountRateBps: toBps(line.discountPercent),
    deductibleRateBps: 10_000,
  }));

  return {
    supplierId,
    number: extraction.number.trim().slice(0, 100),
    issueDate: toDate(extraction.issueDate),
    dueDate: toDate(extraction.dueDate),
    currency: /^[A-Z]{3}$/i.test(extraction.currency) ? extraction.currency.toUpperCase() : 'EUR',
    category: extraction.category satisfies ExpenseCategory,
    // Same bound as the purchase draft validation
    withholdingRateBps: toBps(extraction.withholdingRatePercent, { max: 50 }),
    documentId,
    items,
  };
}
