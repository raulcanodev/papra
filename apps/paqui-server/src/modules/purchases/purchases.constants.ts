export const PURCHASE_INVOICE_ID_PREFIX = 'pinv';
export const PURCHASE_INVOICE_ITEM_ID_PREFIX = 'pitm';

export const PURCHASE_INVOICE_STATUSES = ['pending', 'paid'] as const;
export type PurchaseInvoiceStatus = typeof PURCHASE_INVOICE_STATUSES[number];

// What the received paper is: a delivery note (albarán) records goods received but is not a tax document,
// it stays out of the VAT and income tax figures until the invoice that covers it arrives
export const PURCHASE_DOCUMENT_KINDS = ['invoice', 'simplified_invoice', 'delivery_note'] as const;
export type PurchaseDocumentKind = typeof PURCHASE_DOCUMENT_KINDS[number];
export const NON_TAXABLE_PURCHASE_DOCUMENT_KINDS = ['delivery_note'] as const satisfies PurchaseDocumentKind[];

// Data read on the paper that has no column of its own (order reference, delivery notes, observations...), kept as label and value
export const MAX_PURCHASE_METADATA_ENTRIES = 50;

// Expense categories the accountant needs to book the expenses (and that the income tax estimation groups by)
export const EXPENSE_CATEGORIES = [
  'goods',
  'supplies',
  'rent',
  'professional_services',
  'software',
  'marketing',
  'travel',
  'vehicle',
  'insurance',
  'bank_fees',
  'taxes_and_fees',
  'other',
] as const;
export type ExpenseCategory = typeof EXPENSE_CATEGORIES[number];

// Documents the AI can read to prefill a purchase invoice
export const EXTRACTABLE_DOCUMENT_MIME_TYPES = ['application/pdf', 'image/png', 'image/jpeg', 'image/webp'] as const;
export const MAX_EXTRACTABLE_DOCUMENT_SIZE_BYTES = 10 * 1024 * 1024;
