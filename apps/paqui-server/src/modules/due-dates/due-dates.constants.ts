export const PAYMENT_INSTALMENT_ID_PREFIX = 'pins';

// How an invoice is paid or collected, whatever the country: a bank transfer, a direct debit the creditor charges
// on the due date (also bills of exchange and "giros"), a promissory note (pagaré), a card, cash or anything else
export const PAYMENT_METHODS = ['transfer', 'direct_debit', 'promissory_note', 'card', 'cash', 'other'] as const;
export type PaymentMethod = typeof PAYMENT_METHODS[number];

// pending: still to pay or collect, paid: settled, returned: the charge bounced (a direct debit refused for lack of funds...)
export const INSTALMENT_STATUSES = ['pending', 'paid', 'returned'] as const;
export type InstalmentStatus = typeof INSTALMENT_STATUSES[number];

// payable: a received invoice we have to pay, receivable: an issued invoice our customer has to pay us
export const DUE_DATE_DIRECTIONS = ['payable', 'receivable'] as const;
export type DueDateDirection = typeof DUE_DATE_DIRECTIONS[number];

export const MAX_INSTALMENTS_PER_INVOICE = 24;

// The reminders before a due date, unless the organization chooses otherwise
export const DEFAULT_REMINDER_DAYS_BEFORE = 3;
