import { z } from 'zod';
import { EXPENSE_CATEGORIES, PURCHASE_INVOICE_STATUSES } from './purchases.constants';

const currencySchema = z.string().trim().length(3).transform(value => value.toUpperCase());

export const purchaseInvoiceIdSchema = z.string().trim().min(1).max(64);

export const purchaseInvoiceItemSchema = z.object({
  description: z.string().trim().min(1).max(500),
  quantityMillis: z.number().int().min(1).max(1_000_000_000),
  unitPriceMinor: z.number().int().min(0).max(1_000_000_000),
  taxRateBps: z.number().int().min(0).max(10_000).default(0),
  discountRateBps: z.number().int().min(0).max(10_000).default(0),
  deductibleRateBps: z.number().int().min(0).max(10_000).default(10_000),
});

export const purchaseInvoiceDraftSchema = z.object({
  supplierId: z.string().trim().min(1).max(64),
  number: z.string().trim().min(1).max(100),
  issueDate: z.coerce.date(),
  dueDate: z.coerce.date().optional().nullable(),
  currency: currencySchema.default('EUR'),
  category: z.enum(EXPENSE_CATEGORIES).default('other'),
  withholdingRateBps: z.number().int().min(0).max(5_000).default(0),
  notes: z.string().trim().max(5_000).optional().nullable(),
  documentId: z.string().trim().min(1).max(64).optional().nullable(),
  items: z.array(purchaseInvoiceItemSchema).min(1).max(200),
}).refine(value => value.dueDate === undefined || value.dueDate === null || value.dueDate >= value.issueDate, {
  message: 'Due date must not be before issue date',
  path: ['dueDate'],
});

export const purchaseInvoiceListQuerySchema = z.object({
  status: z.enum(PURCHASE_INVOICE_STATUSES).optional(),
  from: z.coerce.date().optional(),
  to: z.coerce.date().optional(),
});

export const purchaseInvoiceStatusBodySchema = z.object({
  status: z.enum(PURCHASE_INVOICE_STATUSES),
});

export const purchaseInvoiceExtractionBodySchema = z.object({
  documentId: z.string().trim().min(1).max(64),
});
