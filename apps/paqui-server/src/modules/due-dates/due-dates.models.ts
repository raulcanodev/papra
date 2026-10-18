import type { ReminderType } from '../notifications/notifications.constants';
import type { DueDateDirection, InstalmentStatus, PaymentMethod } from './due-dates.constants';

const DAY_MS = 86_400_000;

// Due dates are days: midnight UTC, like the issue and due dates of the invoices
export function startOfUtcDay(date: Date) {
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
}

export function addDays(date: Date, days: number) {
  return new Date(startOfUtcDay(date).getTime() + days * DAY_MS);
}

// Equal parts, the cents left over go to the last one so the parts always add up to the total
export function splitAmount({ totalMinor, count }: { totalMinor: number; count: number }) {
  if (count <= 0) {
    return [];
  }

  const part = Math.floor(totalMinor / count);

  return Array.from({ length: count }, (_, index) => (index === count - 1 ? totalMinor - part * (count - 1) : part));
}

// The due dates printed on a document: an explicit date ("vencimiento 15/11") or a number of days after the issue
// date ("a 30 días", "30/60/90"), each with its amount when printed
export type PrintedDueDate = { date: Date | null; daysAfterIssue: number | null; amountMinor: number | null };

export type InstalmentDraft = { dueDate: Date; amountMinor: number };

// Where the due dates come from, shown to the reviewer: printed dates, printed terms computed from the issue date,
// the usual terms of the contact, or nothing at all
export type InstalmentsSource = 'document' | 'terms' | 'contact_terms' | 'none';

export function computeInstalments({
  issueDate,
  payableMinor,
  printedDueDates = [],
  dueDate = null,
  contactTermsDays = null,
}: {
  issueDate: Date;
  payableMinor: number;
  printedDueDates?: PrintedDueDate[];
  dueDate?: Date | null;
  contactTermsDays?: number | null;
}): { instalments: InstalmentDraft[]; source: InstalmentsSource } {
  const resolved = printedDueDates
    .map(({ date, daysAfterIssue, amountMinor }) => ({
      dueDate: date ?? (daysAfterIssue === null ? null : addDays(issueDate, Math.max(0, daysAfterIssue))),
      amountMinor: amountMinor !== null && amountMinor > 0 ? amountMinor : null,
      isExplicit: date !== null,
    }))
    .filter((entry): entry is { dueDate: Date; amountMinor: number | null; isExplicit: boolean } => entry.dueDate !== null)
    .toSorted((a, b) => a.dueDate.getTime() - b.dueDate.getTime());

  if (resolved.length > 0) {
    // The printed amounts are kept, what is left of the total is shared between the due dates without one
    const knownMinor = resolved.reduce((sum, { amountMinor }) => sum + (amountMinor ?? 0), 0);
    const missing = resolved.filter(({ amountMinor }) => amountMinor === null).length;
    const shares = splitAmount({ totalMinor: Math.max(0, payableMinor - knownMinor), count: missing });
    let shareIndex = 0;

    return {
      instalments: resolved.map(({ dueDate: date, amountMinor }) => ({ dueDate: date, amountMinor: amountMinor ?? shares[shareIndex++]! })),
      source: resolved.some(({ isExplicit }) => isExplicit) ? 'document' : 'terms',
    };
  }

  if (dueDate !== null) {
    return { instalments: [{ dueDate: startOfUtcDay(dueDate), amountMinor: payableMinor }], source: 'document' };
  }

  if (contactTermsDays !== null) {
    return { instalments: [{ dueDate: addDays(issueDate, contactTermsDays), amountMinor: payableMinor }], source: 'contact_terms' };
  }

  return { instalments: [], source: 'none' };
}

// The status of an invoice follows its due dates: paid once every one of them is paid
export function getSettledState({ instalments }: { instalments: { status: InstalmentStatus; paidAt: Date | null }[] }) {
  const isPaid = instalments.length > 0 && instalments.every(({ status }) => status === 'paid');
  const paidAt = isPaid ? instalments.reduce<Date | null>((latest, { paidAt: date }) => (date !== null && (latest === null || date > latest) ? date : latest), null) : null;

  return { isPaid, paidAt };
}

type PlannableInstalment = {
  id: string;
  direction: DueDateDirection;
  dueDate: Date;
  status: InstalmentStatus;
  returnedAt: Date | null;
  paymentMethod?: PaymentMethod | null;
};

export type PlannedReminder = { key: string; type: ReminderType; targetDate: Date };

// The reminders a due date deserves today: a few days before and on the day while it is pending, then one the day after
// if still not settled; a returned charge is overdue at once; nothing once paid. Reminders already due before
// today are not planned again (the overdue one excepted: it stays true until the instalment is settled).
export function planInstalmentReminders({ instalment, daysBefore, now = new Date() }: { instalment: PlannableInstalment; daysBefore: number; now?: Date }): PlannedReminder[] {
  const today = startOfUtcDay(now);
  const key = (suffix: string) => `payment_instalment:${instalment.id}:${suffix}`;
  const [dueType, overdueType] = instalment.direction === 'payable' ? ['payment_due', 'payment_overdue'] as const : ['collection_due', 'collection_overdue'] as const;
  const dueDate = startOfUtcDay(instalment.dueDate);

  if (instalment.status === 'paid') {
    return [];
  }

  if (instalment.status === 'returned') {
    return [{ key: key('returned'), type: overdueType, targetDate: startOfUtcDay(instalment.returnedAt ?? now) }];
  }

  const before = daysBefore > 0 ? addDays(dueDate, -daysBefore) : null;

  return [
    ...(before !== null && before >= today ? [{ key: key('before'), type: dueType, targetDate: before }] : []),
    ...(dueDate >= today ? [{ key: key('due'), type: dueType, targetDate: dueDate }] : []),
    { key: key('overdue'), type: overdueType, targetDate: addDays(dueDate, 1) },
  ];
}

export type DueDateCalendarEvent = {
  id: string;
  date: string;
  name: string;
  type: 'payment-due' | 'collection-due';
  source: string;
  amountMinor: number;
  currency: string;
  status: InstalmentStatus;
  // The document the event opens: a received invoice or an issued one
  link: { entityType: 'purchase_invoice' | 'invoice'; entityId: string; documentId: string | null };
};

export function toDueDateCalendarEvent({ instalment }: { instalment: { id: string; direction: DueDateDirection; dueDate: Date; amountMinor: number; currency: string; status: InstalmentStatus; contactName: string; documentNumber: string | null; documentId: string | null; purchaseInvoiceId: string | null; invoiceId: string | null } }): DueDateCalendarEvent {
  return {
    id: `due-date-${instalment.id}`,
    date: instalment.dueDate.toISOString().slice(0, 10),
    name: [instalment.contactName, instalment.documentNumber].filter(Boolean).join(' · '),
    type: instalment.direction === 'payable' ? 'payment-due' : 'collection-due',
    source: 'Paqui',
    amountMinor: instalment.amountMinor,
    currency: instalment.currency,
    status: instalment.status,
    link: instalment.direction === 'payable'
      ? { entityType: 'purchase_invoice', entityId: instalment.purchaseInvoiceId!, documentId: instalment.documentId }
      : { entityType: 'invoice', entityId: instalment.invoiceId!, documentId: instalment.documentId },
  };
}
