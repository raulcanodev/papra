export const REMINDER_ID_PREFIX = 'rmd';

// What a reminder is about; new kinds of reminders (a contract to renew, a document expiring...) are added here
export const REMINDER_TYPES = ['payment_due', 'collection_due', 'payment_overdue', 'collection_overdue'] as const;
export type ReminderType = typeof REMINDER_TYPES[number];

// pending: to be shown or sent on its date, sent: emailed, dismissed: the user does not want it any more
export const REMINDER_STATUSES = ['pending', 'sent', 'dismissed'] as const;
export type ReminderStatus = typeof REMINDER_STATUSES[number];

// The entity a reminder points to, opened when the user follows it
export const REMINDER_ENTITY_TYPES = ['purchase_invoice', 'invoice', 'payment_instalment'] as const;
export type ReminderEntityType = typeof REMINDER_ENTITY_TYPES[number];

export const SEND_DUE_REMINDERS_TASK_NAME = 'send-due-reminders';
// Once a day, early in the morning (server time)
export const SEND_DUE_REMINDERS_CRON = '0 7 * * *';
// A reminder whose date passed long ago is not worth an email any more (the organization turned emails on later...)
export const MAX_REMINDER_EMAIL_DELAY_DAYS = 7;
