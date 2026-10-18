import { z } from 'zod';
import { instalmentsInputSchema, paymentMethodSchema } from '../due-dates/due-dates.schemas';
import { EXPENSE_CATEGORIES, MAX_PURCHASE_METADATA_ENTRIES, PURCHASE_DOCUMENT_KINDS, PURCHASE_INVOICE_STATUSES } from './purchases.constants';
import { MAX_DOCUMENTS_PER_READING_REQUEST } from './readings/document-readings.constants';

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

export const purchaseMetadataEntrySchema = z.object({
  label: z.string().trim().min(1).max(200),
  value: z.string().trim().min(1).max(2_000),
});

export type PurchaseMetadataEntry = z.infer<typeof purchaseMetadataEntrySchema>;

export const purchaseInvoiceDraftSchema = z.object({
  supplierId: z.string().trim().min(1).max(64),
  number: z.string().trim().min(1).max(100),
  kind: z.enum(PURCHASE_DOCUMENT_KINDS).default('invoice'),
  issueDate: z.coerce.date(),
  dueDate: z.coerce.date().optional().nullable(),
  currency: currencySchema.default('EUR'),
  category: z.enum(EXPENSE_CATEGORIES).default('other'),
  withholdingRateBps: z.number().int().min(0).max(5_000).default(0),
  notes: z.string().trim().max(5_000).optional().nullable(),
  documentId: z.string().trim().min(1).max(64).optional().nullable(),
  metadata: z.array(purchaseMetadataEntrySchema).max(MAX_PURCHASE_METADATA_ENTRIES).default([]),
  items: z.array(purchaseInvoiceItemSchema).min(1).max(200),
  paymentMethod: paymentMethodSchema.optional().nullable(),
  // The due dates, as reviewed by the user; computed from the due date or the supplier payment terms when absent
  instalments: instalmentsInputSchema.optional(),
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

export const purchaseReadingsBodySchema = z.object({
  documentIds: z.array(z.string().trim().min(1).max(64)).min(1).max(MAX_DOCUMENTS_PER_READING_REQUEST),
  // Read again a document already read (the user asks for a new reading)
  force: z.boolean().optional().default(false),
});

export const purchaseReadingsQuerySchema = z.object({
  documentIds: z.string().trim().min(1).transform(value => [...new Set(value.split(',').map(id => id.trim()).filter(Boolean))].slice(0, MAX_DOCUMENTS_PER_READING_REQUEST)),
});
