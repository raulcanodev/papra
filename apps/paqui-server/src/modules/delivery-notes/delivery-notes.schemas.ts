import { z } from 'zod';
import { DELIVERY_NOTE_ID_PREFIX, DELIVERY_NOTE_STATUSES, MAX_INVOICED_DELIVERY_NOTES } from './delivery-notes.constants';

const idSchema = z.string().trim().min(1).max(64);

export const deliveryNoteIdSchema = z.string().trim().startsWith(`${DELIVERY_NOTE_ID_PREFIX}_`).max(64);

export const deliveryNoteItemSchema = z.object({
  productId: idSchema.optional().nullable(),
  writtenText: z.string().trim().max(500).optional().nullable(),
  description: z.string().trim().min(1).max(500),
  quantityMillis: z.number().int().min(1).max(1_000_000_000),
});

export const deliveryNoteDraftSchema = z.object({
  customerId: idSchema,
  number: z.string().trim().max(60).optional().nullable().transform(value => (value === '' ? null : value ?? null)),
  date: z.coerce.date(),
  notes: z.string().trim().max(5_000).optional().nullable(),
  documentId: idSchema.optional().nullable(),
  items: z.array(deliveryNoteItemSchema).min(1).max(200),
});

export const deliveryNoteListQuerySchema = z.object({
  status: z.enum(DELIVERY_NOTE_STATUSES).optional(),
  customerId: idSchema.optional(),
});

export const deliveryNoteReadingBodySchema = z.object({
  documentId: idSchema,
});

export const deliveryNotesInvoiceBodySchema = z.object({
  deliveryNoteIds: z.array(deliveryNoteIdSchema).min(1).max(MAX_INVOICED_DELIVERY_NOTES),
});

export type DeliveryNoteDraft = z.infer<typeof deliveryNoteDraftSchema>;
export type DeliveryNoteItemInput = z.infer<typeof deliveryNoteItemSchema>;
