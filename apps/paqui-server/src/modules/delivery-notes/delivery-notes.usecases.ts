import type { Database } from '../app/database/database.types';
import { createContactsRepository } from '../contacts/contacts.repository';
import { createInvoicingRepository } from '../invoicing/invoicing.repository';
import { createPricingRepository } from '../pricing/pricing.repository';
import { createDeliveryNoteInvoicedError, createDeliveryNoteNotFoundError, createDeliveryNotesMixedCustomersError } from './delivery-notes.errors';
import { buildInvoiceFromDeliveryNotes } from './delivery-notes.models';
import { createDeliveryNotesRepository } from './delivery-notes.repository';

const DAY_MS = 24 * 60 * 60 * 1_000;

function startOfUtcDay(date: Date) {
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
}

// Several delivery notes of a customer become one draft invoice, priced with the customer price list and reviewed
// before it is issued. They stay linked to it: deleting the draft makes them pending again
export async function invoiceDeliveryNotes({ db, organizationId, deliveryNoteIds, userId, now = new Date() }: { db: Database; organizationId: string; deliveryNoteIds: string[]; userId: string; now?: Date }) {
  const ids = [...new Set(deliveryNoteIds)];
  const { deliveryNotes } = await createDeliveryNotesRepository({ db }).getDeliveryNotesWithItems({ organizationId, deliveryNoteIds: ids });

  if (deliveryNotes.length !== ids.length) {
    throw createDeliveryNoteNotFoundError();
  }

  if (deliveryNotes.some(({ invoiceId }) => invoiceId !== null)) {
    throw createDeliveryNoteInvoicedError();
  }

  const [{ customerId }] = deliveryNotes as [typeof deliveryNotes[number], ...typeof deliveryNotes];

  if (deliveryNotes.some(deliveryNote => deliveryNote.customerId !== customerId)) {
    throw createDeliveryNotesMixedCustomersError();
  }

  const invoicingRepository = createInvoicingRepository({ db });
  const [{ profile }, { contact: customer }, { products }, { taxRates }, contactPrices] = await Promise.all([
    invoicingRepository.getFiscalProfile({ organizationId }),
    createContactsRepository({ db }).getContact({ organizationId, contactId: customerId }),
    invoicingRepository.listProducts({ organizationId }),
    invoicingRepository.listTaxRates({ organizationId }),
    createPricingRepository({ db }).getContactPrices({ organizationId, contactId: customerId }),
  ]);
  const locale = profile?.locale ?? 'es-ES';
  const { items, reference } = buildInvoiceFromDeliveryNotes({
    deliveryNotes,
    pricing: {
      products,
      priceList: contactPrices.priceList === null ? null : { discountRateBps: contactPrices.priceList.discountRateBps, prices: contactPrices.prices },
      defaultTaxRateBps: taxRates.find(({ isDefault }) => isDefault)?.rateBps ?? 2_100,
    },
    formatDate: date => date.toLocaleDateString(locale, { timeZone: 'UTC', day: '2-digit', month: '2-digit', year: 'numeric' }),
  });
  const label = locale.toLowerCase().startsWith('es') ? 'Albaranes' : 'Delivery notes';
  const issueDate = startOfUtcDay(now);
  const termsDays = customer?.paymentTermsDays ?? profile?.paymentTermsDays ?? 30;

  return db.transaction(async (transaction) => {
    const tx = transaction as unknown as Database;
    const { invoice } = await createInvoicingRepository({ db: tx }).createInvoice({
      organizationId,
      userId,
      draft: {
        customerId,
        issueDate,
        dueDate: new Date(issueDate.getTime() + termsDays * DAY_MS),
        currency: customer?.currency ?? profile?.currency ?? 'EUR',
        templateId: profile?.templateId === 'classic' ? 'classic' : 'minimal',
        withholdingRateBps: profile?.defaultWithholdingRateBps ?? 0,
        notes: [`${label}: ${reference}`, profile?.defaultNotes].filter(Boolean).join('\n\n'),
        items,
      },
    });

    await createDeliveryNotesRepository({ db: tx }).markInvoiced({ organizationId, deliveryNoteIds: ids, invoiceId: invoice!.id, now });

    return { invoice: invoice! };
  });
}
