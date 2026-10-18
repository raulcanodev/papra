import type { Storage } from 'unstorage';
import type { DueDateCalendarEvent } from '../../calendar/calendar.types';
import type { DueDateSettings, InstalmentStatus } from '../../due-dates/due-dates.types';
import type { DemoStoredInstalment } from './demo-due-dates.models';
import { FetchError } from 'ofetch';
import { prefixStorage } from 'unstorage';
import { defineHandler } from '../demo-api-mock.models';
import { getDemoInvoicingRecords, listDemoContacts, setDemoInvoicePaidState } from '../invoicing/demo-invoicing';
import { listDemoPurchaseInvoices, saveDemoPurchaseInvoice } from '../purchases/demo-purchases';
import { getDemoSettledState, setDemoInstalmentStatus } from './demo-due-dates.models';

// The due dates of the demo: those of the received invoices are kept inside each purchase, those of the issued invoices
// are one per invoice, on its due date, with their collection state kept here
type ReceivableState = Pick<DemoStoredInstalment, 'status' | 'paidAt' | 'returnedAt'>;

let storages: { receivables: Storage<ReceivableState>; settings: Storage<DueDateSettings> } | undefined;

export function bindDueDatesStorage(storage: Storage<any>) {
  storages = {
    receivables: prefixStorage<ReceivableState>(storage, 'due-dates:receivables'),
    settings: prefixStorage<DueDateSettings>(storage, 'due-dates:settings'),
  };
}

function db() {
  if (!storages) {
    throw new Error('Demo due dates storage is not bound');
  }

  return storages;
}

const DEFAULT_SETTINGS: DueDateSettings = { emailRemindersEnabled: false, reminderEmail: null, reminderDaysBefore: 3, readIntakeEmailAttachments: true };
const COLLECTABLE_INVOICE_STATUSES = ['issued', 'sent', 'paid'];
const receivableId = (invoiceId: string) => `pins_${invoiceId}`;

export async function listDemoInstalments({ organizationId }: { organizationId: string }) {
  const [purchases, { invoices }, contacts] = await Promise.all([listDemoPurchaseInvoices({ organizationId }), getDemoInvoicingRecords({ organizationId }), listDemoContacts({ organizationId })]);
  const contactsById = new Map(contacts.map(contact => [contact.id, contact]));
  const contactFields = (contactId: string) => {
    const contact = contactsById.get(contactId);
    return { contactId, contactName: contact?.name ?? '—', contactIcon: contact?.icon ?? null, contactIconColor: contact?.iconColor ?? null };
  };

  const payables = purchases.flatMap(purchase => ((purchase.instalments ?? []) as DemoStoredInstalment[]).map(instalment => ({
    ...instalment,
    organizationId,
    direction: 'payable' as const,
    purchaseInvoiceId: purchase.id as string,
    invoiceId: null,
    currency: purchase.currency as string,
    ...contactFields(purchase.supplierId),
    documentNumber: purchase.number as string,
    documentId: (purchase.documentId as string | null) ?? null,
    issueDate: purchase.issueDate as string,
    invoiceStatus: null,
  })));

  const receivables = await Promise.all(invoices
    .filter(invoice => COLLECTABLE_INVOICE_STATUSES.includes(invoice.status))
    .map(async (invoice) => {
      const state = await db().receivables.getItem(invoice.id);
      const isPaid = invoice.status === 'paid';

      return {
        id: receivableId(invoice.id),
        organizationId,
        direction: 'receivable' as const,
        purchaseInvoiceId: null,
        invoiceId: invoice.id as string,
        dueDate: invoice.dueDate as string,
        amountMinor: (invoice.totalMinor as number) - ((invoice.withholdingMinor as number | undefined) ?? 0),
        currency: invoice.currency as string,
        paymentMethod: invoice.paymentMethod ?? null,
        status: state?.status ?? (isPaid ? 'paid' : 'pending'),
        paidAt: state ? state.paidAt : (isPaid ? invoice.paidAt ?? null : null),
        returnedAt: state?.returnedAt ?? null,
        position: 0,
        ...contactFields(invoice.customerId),
        documentNumber: invoice.number as string | null,
        documentId: (invoice.documentId as string | null) ?? null,
        issueDate: invoice.issueDate as string,
        invoiceStatus: invoice.status as string,
      };
    }));

  return [...payables, ...receivables].toSorted((a, b) => a.dueDate.localeCompare(b.dueDate));
}

async function setDemoDueDateStatus({ organizationId, instalmentId, status }: { organizationId: string; instalmentId: string; status: InstalmentStatus }) {
  const instalment = (await listDemoInstalments({ organizationId })).find(({ id }) => id === instalmentId);

  if (!instalment) {
    throw Object.assign(new FetchError('Due date not found.'), { status: 404, data: { error: { code: 'payment_instalment.not_found', message: 'Due date not found.' } } });
  }

  if (instalment.direction === 'payable') {
    const purchase = (await listDemoPurchaseInvoices({ organizationId })).find(({ id }) => id === instalment.purchaseInvoiceId)!;
    const instalments = (purchase.instalments as DemoStoredInstalment[]).map(stored => (stored.id === instalmentId ? setDemoInstalmentStatus({ instalment: stored, status }) : stored));
    await saveDemoPurchaseInvoice({ ...purchase, instalments, ...getDemoSettledState(instalments), updatedAt: new Date().toISOString() });
  } else {
    const updated = setDemoInstalmentStatus({ instalment: instalment as unknown as DemoStoredInstalment, status });
    await db().receivables.setItem(instalment.invoiceId!, { status: updated.status, paidAt: updated.paidAt, returnedAt: updated.returnedAt });
    await setDemoInvoicePaidState({ invoiceId: instalment.invoiceId!, isPaid: status === 'paid' });
  }

  return (await listDemoInstalments({ organizationId })).find(({ id }) => id === instalmentId)!;
}

/** The due dates of the year as calendar events, each opening its invoice */
export async function listDemoDueDateCalendarEvents({ organizationId, year }: { organizationId: string; year: number }): Promise<DueDateCalendarEvent[]> {
  return (await listDemoInstalments({ organizationId }))
    .filter(({ dueDate }) => dueDate.startsWith(`${year}-`))
    .map(instalment => ({
      id: `due-date-${instalment.id}`,
      date: instalment.dueDate.slice(0, 10),
      name: [instalment.contactName, instalment.documentNumber].filter(Boolean).join(' · '),
      type: instalment.direction === 'payable' ? 'payment-due' : 'collection-due',
      source: 'Paqui',
      amountMinor: instalment.amountMinor,
      currency: instalment.currency,
      status: instalment.status,
      link: instalment.direction === 'payable'
        ? { entityType: 'purchase_invoice', entityId: instalment.purchaseInvoiceId!, documentId: instalment.documentId }
        : { entityType: 'invoice', entityId: instalment.invoiceId!, documentId: instalment.documentId },
    }));
}

export const dueDatesHandlers = {
  ...defineHandler({
    path: '/api/organizations/:organizationId/due-dates',
    method: 'GET',
    handler: async ({ params: { organizationId }, query }: any) => {
      const instalments = await listDemoInstalments({ organizationId });

      return { instalments: query?.direction ? instalments.filter(({ direction }) => direction === query.direction) : instalments };
    },
  }),
  ...defineHandler({
    path: '/api/organizations/:organizationId/due-dates/:instalmentId/status',
    method: 'PATCH',
    handler: async ({ params: { organizationId, instalmentId }, body }: any) => ({ instalment: await setDemoDueDateStatus({ organizationId, instalmentId, status: body.status }) }),
  }),
  ...defineHandler({
    path: '/api/organizations/:organizationId/due-dates/settings',
    method: 'GET',
    handler: async ({ params: { organizationId } }) => ({ settings: (await db().settings.getItem(organizationId)) ?? DEFAULT_SETTINGS }),
  }),
  ...defineHandler({
    path: '/api/organizations/:organizationId/due-dates/settings',
    method: 'PUT',
    handler: async ({ params: { organizationId }, body }: any) => {
      const settings: DueDateSettings = { ...DEFAULT_SETTINGS, ...body, reminderEmail: body?.reminderEmail || null };
      await db().settings.setItem(organizationId, settings);

      return { settings };
    },
  }),
  // The demo sends no email: the reminders are listed from the due dates, as the server plans them
  ...defineHandler({
    path: '/api/organizations/:organizationId/reminders',
    method: 'GET',
    handler: async () => ({ reminders: [] }),
  }),
};
