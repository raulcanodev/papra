import { z } from 'zod';
import { DUE_DATE_DIRECTIONS, INSTALMENT_STATUSES, MAX_INSTALMENTS_PER_INVOICE, PAYMENT_METHODS } from './due-dates.constants';

export const paymentMethodSchema = z.enum(PAYMENT_METHODS);

// The due dates of an invoice as typed (or reviewed) by the user; none means "compute it" (see computeInstalments)
export const instalmentsInputSchema = z.array(z.object({
  dueDate: z.coerce.date(),
  amountMinor: z.number().int().min(0).max(1_000_000_000),
  paymentMethod: paymentMethodSchema.optional().nullable(),
  status: z.enum(INSTALMENT_STATUSES).optional(),
  // When a paid due date was paid: an old invoice registered as already paid was not paid today
  paidAt: z.coerce.date().optional().nullable(),
})).max(MAX_INSTALMENTS_PER_INVOICE);

export const instalmentIdSchema = z.string().trim().min(1).max(64);

export const dueDatesListQuerySchema = z.object({
  direction: z.enum(DUE_DATE_DIRECTIONS).optional(),
  from: z.coerce.date().optional(),
  to: z.coerce.date().optional(),
});

export const instalmentStatusBodySchema = z.object({
  status: z.enum(INSTALMENT_STATUSES),
});

export const dueDateSettingsBodySchema = z.object({
  emailRemindersEnabled: z.boolean(),
  // Empty means the organization owner
  reminderEmail: z.preprocess(value => (value === '' ? null : value), z.string().trim().email().max(254).nullable().default(null)),
  reminderDaysBefore: z.number().int().min(0).max(30),
  readIntakeEmailAttachments: z.boolean(),
});
