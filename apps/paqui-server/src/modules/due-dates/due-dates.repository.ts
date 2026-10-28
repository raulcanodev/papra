import type { Database } from '../app/database/database.types';
import type { ReminderPlan } from '../notifications/notifications.repository';
import type { DueDateDirection, InstalmentStatus, PaymentMethod } from './due-dates.constants';
import { and, asc, eq, gte, inArray, isNull, lt, or } from 'drizzle-orm';
import { contactsTable } from '../contacts/contacts.table';
import { invoicesTable } from '../invoicing/invoicing.tables';
import { createRemindersRepository } from '../notifications/notifications.repository';
import { purchaseInvoicesTable } from '../purchases/purchases.tables';
import { DEFAULT_REMINDER_DAYS_BEFORE } from './due-dates.constants';
import { createInstalmentNotFoundError } from './due-dates.errors';
import { getSettledState, planInstalmentReminders } from './due-dates.models';
import { dueDateSettingsTable, paymentInstalmentsTable } from './due-dates.tables';

export type PaymentInstalment = typeof paymentInstalmentsTable.$inferSelect;

export type InstalmentInput = { dueDate: Date; amountMinor: number; paymentMethod?: PaymentMethod | null; status?: InstalmentStatus; paidAt?: Date | null };

// The document a due date belongs to: a received invoice (to pay) or an issued one (to collect)
export type InstalmentSource = { direction: 'payable'; purchaseInvoiceId: string } | { direction: 'receivable'; invoiceId: string };

export type DueDateSettings = Omit<typeof dueDateSettingsTable.$inferSelect, 'createdAt' | 'updatedAt'>;
export type DueDateSettingsInput = Omit<DueDateSettings, 'organizationId'>;

// Issued invoices only: a draft is not owed yet, a voided one never will be
const COLLECTABLE_INVOICE_STATUSES = ['issued', 'sent', 'paid'];

function sourceCondition(source: InstalmentSource) {
  return source.direction === 'payable'
    ? eq(paymentInstalmentsTable.purchaseInvoiceId, source.purchaseInvoiceId)
    : eq(paymentInstalmentsTable.invoiceId, source.invoiceId);
}

function toSource(instalment: Pick<PaymentInstalment, 'direction' | 'purchaseInvoiceId' | 'invoiceId'>): InstalmentSource {
  return instalment.direction === 'payable'
    ? { direction: 'payable', purchaseInvoiceId: instalment.purchaseInvoiceId! }
    : { direction: 'receivable', invoiceId: instalment.invoiceId! };
}

export type DueDatesRepository = ReturnType<typeof createDueDatesRepository>;

export function createDueDatesRepository({ db }: { db: Database }) {
  return {
    listInstalments: async (args: ListInstalmentsArgs) => listInstalments({ db, ...args }),
    saveSourceInstalments: async (args: { organizationId: string; source: InstalmentSource; contactId: string; currency: string; paymentMethod: PaymentMethod | null; instalments: InstalmentInput[]; now?: Date }) => saveSourceInstalments({ db, ...args }),
    setSourceInstalmentsStatus: async (args: { organizationId: string; source: InstalmentSource; status: InstalmentStatus; now?: Date }) => setSourceInstalmentsStatus({ db, ...args }),
    setInstalmentStatus: async (args: { organizationId: string; instalmentId: string; status: InstalmentStatus; now?: Date }) => setInstalmentStatus({ db, ...args }),
    syncSourceReminders: async (args: { organizationId: string; source: InstalmentSource; now?: Date }) => syncSourceReminders({ db, ...args }),
    getSettings: async (args: { organizationId: string }) => getSettings({ db, ...args }),
    saveSettings: async (args: { organizationId: string; settings: DueDateSettingsInput }) => saveSettings({ db, ...args }),
  };
}

type ListInstalmentsArgs = { organizationId: string; direction?: DueDateDirection; source?: InstalmentSource; from?: Date; to?: Date; instalmentIds?: string[] };

// The due dates with what the lists show of their invoice and contact, oldest first
async function listInstalments({ db, organizationId, direction, source, from, to, instalmentIds }: ListInstalmentsArgs & { db: Database }) {
  const rows = await db
    .select({
      instalment: paymentInstalmentsTable,
      contactName: contactsTable.name,
      contactIcon: contactsTable.icon,
      contactIconColor: contactsTable.iconColor,
      purchaseNumber: purchaseInvoicesTable.number,
      purchaseDocumentId: purchaseInvoicesTable.documentId,
      purchaseIssueDate: purchaseInvoicesTable.issueDate,
      invoiceNumber: invoicesTable.number,
      invoiceDocumentId: invoicesTable.documentId,
      invoiceIssueDate: invoicesTable.issueDate,
      invoiceStatus: invoicesTable.status,
    })
    .from(paymentInstalmentsTable)
    .innerJoin(contactsTable, eq(paymentInstalmentsTable.contactId, contactsTable.id))
    .leftJoin(purchaseInvoicesTable, eq(paymentInstalmentsTable.purchaseInvoiceId, purchaseInvoicesTable.id))
    .leftJoin(invoicesTable, eq(paymentInstalmentsTable.invoiceId, invoicesTable.id))
    .where(and(
      eq(paymentInstalmentsTable.organizationId, organizationId),
      direction === undefined ? undefined : eq(paymentInstalmentsTable.direction, direction),
      source === undefined ? undefined : sourceCondition(source),
      instalmentIds === undefined ? undefined : inArray(paymentInstalmentsTable.id, instalmentIds),
      from === undefined ? undefined : gte(paymentInstalmentsTable.dueDate, from),
      to === undefined ? undefined : lt(paymentInstalmentsTable.dueDate, to),
      // The due dates of a draft or voided invoice are kept with it but owed by no one
      source === undefined ? or(isNull(paymentInstalmentsTable.invoiceId), inArray(invoicesTable.status, COLLECTABLE_INVOICE_STATUSES)) : undefined,
    ))
    .orderBy(asc(paymentInstalmentsTable.dueDate), asc(paymentInstalmentsTable.position));

  return {
    instalments: rows.map(row => ({
      ...row.instalment,
      contactName: row.contactName,
      contactIcon: row.contactIcon,
      contactIconColor: row.contactIconColor,
      documentNumber: row.purchaseNumber ?? row.invoiceNumber,
      documentId: row.purchaseDocumentId ?? row.invoiceDocumentId,
      issueDate: row.purchaseIssueDate ?? row.invoiceIssueDate,
      // Only for issued invoices, a received one has no workflow of its own
      invoiceStatus: row.invoiceStatus,
    })),
  };
}

export type ListedInstalment = Awaited<ReturnType<typeof listInstalments>>['instalments'][number];

// A payment date given by the user wins, otherwise a payment keeps its date and a new one is dated now
function getStatusDates({ status, previous, now, paidAt }: { status: InstalmentStatus; previous?: Pick<PaymentInstalment, 'status' | 'paidAt' | 'returnedAt'>; now: Date; paidAt?: Date | null }) {
  return {
    paidAt: status === 'paid' ? (paidAt ?? (previous?.status === 'paid' ? previous.paidAt : now)) : null,
    returnedAt: status === 'returned' ? (previous?.status === 'returned' ? previous.returnedAt : now) : null,
  };
}

// The due dates of a document as saved by the user: matched by position, so each one keeps its id (and its reminders
// already sent) when only its date or amount changes. A due date without a status keeps the one it had.
async function saveSourceInstalments({ db, organizationId, source, contactId, currency, paymentMethod, instalments, now = new Date() }: { db: Database; organizationId: string; source: InstalmentSource; contactId: string; currency: string; paymentMethod: PaymentMethod | null; instalments: InstalmentInput[]; now?: Date }) {
  const existing = await db.select().from(paymentInstalmentsTable).where(and(eq(paymentInstalmentsTable.organizationId, organizationId), sourceCondition(source))).orderBy(asc(paymentInstalmentsTable.position));

  for (const [position, instalment] of instalments.entries()) {
    const previous = existing[position];
    const status = instalment.status ?? previous?.status ?? 'pending';
    const values = {
      contactId,
      currency,
      dueDate: instalment.dueDate,
      amountMinor: instalment.amountMinor,
      paymentMethod: instalment.paymentMethod ?? paymentMethod,
      status,
      ...getStatusDates({ status, previous, now, paidAt: instalment.paidAt }),
      position,
    };

    if (previous) {
      await db.update(paymentInstalmentsTable).set({ ...values, updatedAt: now }).where(eq(paymentInstalmentsTable.id, previous.id));
    } else {
      await db.insert(paymentInstalmentsTable).values({
        organizationId,
        direction: source.direction,
        purchaseInvoiceId: source.direction === 'payable' ? source.purchaseInvoiceId : null,
        invoiceId: source.direction === 'receivable' ? source.invoiceId : null,
        ...values,
      });
    }
  }

  const removed = existing.slice(instalments.length).map(({ id }) => id);
  if (removed.length > 0) {
    await db.delete(paymentInstalmentsTable).where(inArray(paymentInstalmentsTable.id, removed));
  }

  if (instalments.length > 0) {
    await applyInstalmentsToSource({ db, organizationId, source, now });
  }

  await syncSourceReminders({ db, organizationId, source, now });
}

// The whole document marked paid (or pending again) at once, from the invoice lists
async function setSourceInstalmentsStatus({ db, organizationId, source, status, now = new Date() }: { db: Database; organizationId: string; source: InstalmentSource; status: InstalmentStatus; now?: Date }) {
  const existing = await db.select().from(paymentInstalmentsTable).where(and(eq(paymentInstalmentsTable.organizationId, organizationId), sourceCondition(source)));

  for (const instalment of existing) {
    // Back to pending only undoes payments: a returned charge stays returned
    if (instalment.status === status || (status === 'pending' && instalment.status === 'returned')) {
      continue;
    }

    await db.update(paymentInstalmentsTable).set({ status, ...getStatusDates({ status, previous: instalment, now }), updatedAt: now }).where(eq(paymentInstalmentsTable.id, instalment.id));
  }

  await syncSourceReminders({ db, organizationId, source, now });
}

// One due date paid, returned or pending again: its invoice follows (paid once every due date is) and so do its reminders
async function setInstalmentStatus({ db, organizationId, instalmentId, status, now = new Date() }: { db: Database; organizationId: string; instalmentId: string; status: InstalmentStatus; now?: Date }) {
  const [instalment] = await db.select().from(paymentInstalmentsTable).where(and(eq(paymentInstalmentsTable.id, instalmentId), eq(paymentInstalmentsTable.organizationId, organizationId))).limit(1);

  if (!instalment) {
    throw createInstalmentNotFoundError();
  }

  await db.update(paymentInstalmentsTable).set({ status, ...getStatusDates({ status, previous: instalment, now }), updatedAt: now }).where(eq(paymentInstalmentsTable.id, instalmentId));

  const source = toSource(instalment);
  await applyInstalmentsToSource({ db, organizationId, source, now });
  await syncSourceReminders({ db, organizationId, source, now });

  const { instalments: [updated] } = await listInstalments({ db, organizationId, instalmentIds: [instalmentId], source });

  return { instalment: updated! };
}

async function applyInstalmentsToSource({ db, organizationId, source, now }: { db: Database; organizationId: string; source: InstalmentSource; now: Date }) {
  const instalments = await db.select().from(paymentInstalmentsTable).where(and(eq(paymentInstalmentsTable.organizationId, organizationId), sourceCondition(source)));
  const { isPaid, paidAt } = getSettledState({ instalments });

  if (source.direction === 'payable') {
    await db
      .update(purchaseInvoicesTable)
      .set({ status: isPaid ? 'paid' : 'pending', paidAt, updatedAt: now })
      .where(and(eq(purchaseInvoicesTable.id, source.purchaseInvoiceId), eq(purchaseInvoicesTable.organizationId, organizationId)));
    return;
  }

  const [invoice] = await db.select({ status: invoicesTable.status, sentAt: invoicesTable.sentAt }).from(invoicesTable).where(and(eq(invoicesTable.id, source.invoiceId), eq(invoicesTable.organizationId, organizationId))).limit(1);

  if (!invoice) {
    return;
  }

  if (isPaid && (invoice.status === 'issued' || invoice.status === 'sent')) {
    await db.update(invoicesTable).set({ status: 'paid', paidAt, updatedAt: now }).where(eq(invoicesTable.id, source.invoiceId));
  }

  // A payment undone or returned: the invoice is owed again
  if (!isPaid && invoice.status === 'paid') {
    await db.update(invoicesTable).set({ status: invoice.sentAt === null ? 'issued' : 'sent', paidAt: null, updatedAt: now }).where(eq(invoicesTable.id, source.invoiceId));
  }
}

// Plans the reminders of every due date of the document again; a draft or voided invoice has none
async function syncSourceReminders({ db, organizationId, source, now = new Date() }: { db: Database; organizationId: string; source: InstalmentSource; now?: Date }) {
  const [{ instalments }, { settings }] = await Promise.all([listInstalments({ db, organizationId, source }), getSettings({ db, organizationId })]);
  const remindersRepository = createRemindersRepository({ db });

  for (const instalment of instalments) {
    const isOwed = instalment.direction === 'payable' || COLLECTABLE_INVOICE_STATUSES.includes(instalment.invoiceStatus ?? '');
    const planned = isOwed ? planInstalmentReminders({ instalment, daysBefore: settings.reminderDaysBefore, now }) : [];
    const reminders = planned.map((reminder): ReminderPlan => ({
      ...reminder,
      entityType: instalment.direction === 'payable' ? 'purchase_invoice' : 'invoice',
      entityId: instalment.purchaseInvoiceId ?? instalment.invoiceId,
      data: {
        title: [instalment.contactName, instalment.documentNumber].filter(Boolean).join(' · '),
        contactName: instalment.contactName,
        documentNumber: instalment.documentNumber,
        amountMinor: instalment.amountMinor,
        currency: instalment.currency,
        dueDate: instalment.dueDate.toISOString().slice(0, 10),
      },
    }));

    await remindersRepository.syncInstalmentReminders({ organizationId, paymentInstalmentId: instalment.id, reminders, now });
  }
}

const DEFAULT_SETTINGS: DueDateSettingsInput = { emailRemindersEnabled: false, reminderEmail: null, reminderDaysBefore: DEFAULT_REMINDER_DAYS_BEFORE, readIntakeEmailAttachments: true };

async function getSettings({ db, organizationId }: { db: Database; organizationId: string }): Promise<{ settings: DueDateSettings }> {
  const [row] = await db.select().from(dueDateSettingsTable).where(eq(dueDateSettingsTable.organizationId, organizationId)).limit(1);

  if (!row) {
    return { settings: { organizationId, ...DEFAULT_SETTINGS } };
  }

  const { createdAt: _createdAt, updatedAt: _updatedAt, ...settings } = row;

  return { settings };
}

async function saveSettings({ db, organizationId, settings }: { db: Database; organizationId: string; settings: DueDateSettingsInput }) {
  const now = new Date();

  await db
    .insert(dueDateSettingsTable)
    .values({ organizationId, ...settings })
    .onConflictDoUpdate({ target: dueDateSettingsTable.organizationId, set: { ...settings, updatedAt: now } });

  return getSettings({ db, organizationId });
}
