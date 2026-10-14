export const PURCHASE_INVOICE_ID_PREFIX = 'pinv';
export const PURCHASE_INVOICE_ITEM_ID_PREFIX = 'pitm';

export const PURCHASE_INVOICE_STATUSES = ['pending', 'paid'] as const;
export type PurchaseInvoiceStatus = typeof PURCHASE_INVOICE_STATUSES[number];

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
