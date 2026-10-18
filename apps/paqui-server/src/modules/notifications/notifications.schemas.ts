import { z } from 'zod';
import { REMINDER_STATUSES } from './notifications.constants';

export const reminderListQuerySchema = z.object({
  status: z.enum(REMINDER_STATUSES).optional(),
  from: z.coerce.date().optional(),
  to: z.coerce.date().optional(),
});
