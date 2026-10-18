import type { EntityIconColor } from '../ui/components/entity-icon.constants';

/** How an invoice is paid or collected, the same list for every country and sector */
export type PaymentMethod = 'transfer' | 'direct_debit' | 'promissory_note' | 'card' | 'cash' | 'other';

/** returned: the charge bounced (a direct debit refused for lack of funds...), the amount is owed again */
export type InstalmentStatus = 'pending' | 'paid' | 'returned';

/** payable: a received invoice to pay, receivable: an issued invoice to collect */
export type DueDateDirection = 'payable' | 'receivable';

/** Where the due dates of an AI reading come from */
export type InstalmentsSource = 'document' | 'terms' | 'contact_terms' | 'none';

export type InstalmentInput = { dueDate: Date; amountMinor: number; paymentMethod?: PaymentMethod | null; status?: InstalmentStatus };

export type PaymentInstalment = {
  id: string;
  organizationId: string;
  direction: DueDateDirection;
  purchaseInvoiceId: string | null;
  invoiceId: string | null;
  contactId: string;
  dueDate: Date;
  amountMinor: number;
  currency: string;
  paymentMethod: PaymentMethod | null;
  status: InstalmentStatus;
  paidAt: Date | null;
  returnedAt: Date | null;
  position: number;
  contactName: string;
  contactIcon: string | null;
  contactIconColor: EntityIconColor | null;
  documentNumber: string | null;
  documentId: string | null;
  issueDate: Date | null;
  invoiceStatus: string | null;
};

export type DueDateSettings = {
  emailRemindersEnabled: boolean;
  reminderEmail: string | null;
  reminderDaysBefore: number;
  readIntakeEmailAttachments: boolean;
};

/** The periods the due dates are added up by */
export type DueDateBucket = 'overdue' | 'next_30' | 'days_31_60' | 'days_61_90' | 'later';
