import type { Database } from '../app/database/database.types';
import type { InvoiceDraftInput } from './invoicing.models';
import { createContactsRepository } from '../contacts/contacts.repository';
import { createFiscalProfileRequiredError } from './invoicing.errors';
import { calculateInvoiceTotals, formatInvoiceNumber } from './invoicing.models';
import { renderInvoicePdf } from './invoicing.pdf';
import { createInvoicingRepository } from './invoicing.repository';

type StoredProforma = NonNullable<Awaited<ReturnType<ReturnType<typeof createInvoicingRepository>['getInvoice']>>['invoice']>;

// Across a preview: what it says in the language of the invoice
export function getPreviewWatermark({ locale }: { locale: string | null | undefined }) {
  return (locale ?? '').toLowerCase().startsWith('es') ? 'BORRADOR' : 'DRAFT';
}

/**
 * The PDF the invoice would be if issued now, from the form as it is (nothing is saved): the same layout, the seller,
 * the customer, the branding and the number it would take, with a big watermark so it is never sent as the real one.
 */
export async function renderInvoicePreviewPdf({ db, organizationId, draft }: { db: Database; organizationId: string; draft: InvoiceDraftInput }) {
  const invoicingRepository = createInvoicingRepository({ db });
  const contactsRepository = createContactsRepository({ db });

  const { contact: customer } = await contactsRepository.getContactWithRole({ organizationId, contactId: draft.customerId, role: 'customer' });
  const salesRepresentative = draft.salesRepresentativeId === undefined || draft.salesRepresentativeId === null
    ? null
    : (await contactsRepository.getContactWithRole({ organizationId, contactId: draft.salesRepresentativeId, role: 'sales_representative' })).contact;
  const [{ profile }, { branding }, { series }] = await Promise.all([
    invoicingRepository.getFiscalProfile({ organizationId }),
    invoicingRepository.getBranding({ organizationId }),
    invoicingRepository.listSeries({ organizationId }),
  ]);

  // The series it would be issued in, without creating the default one as issuing does; a proforma takes no number
  const issuingSeries = draft.isProforma === true ? undefined : series.find(({ id }) => id === draft.seriesId) ?? series.find(({ isDefault }) => isDefault) ?? series[0];
  const equivalenceSurcharge = draft.equivalenceSurcharge ?? customer.equivalenceSurcharge ?? false;
  const totals = calculateInvoiceTotals({ items: draft.items, withholdingRateBps: draft.withholdingRateBps, equivalenceSurcharge });

  const pdf = await renderInvoicePdf({
    number: issuingSeries ? formatInvoiceNumber(issuingSeries) : null,
    issueDate: draft.issueDate,
    dueDate: draft.dueDate,
    currency: draft.currency,
    ...totals,
    equivalenceSurcharge,
    notes: draft.notes ?? profile?.defaultNotes ?? null,
    terms: draft.terms ?? profile?.defaultTerms ?? null,
    templateId: draft.templateId,
    watermark: draft.isProforma === true ? null : getPreviewWatermark({ locale: profile?.locale }),
    isProforma: draft.isProforma === true,
    sellerSnapshot: profile ? JSON.stringify(profile) : null,
    customerSnapshot: JSON.stringify(customer),
    salesRepresentativeSnapshot: salesRepresentative ? JSON.stringify(salesRepresentative) : null,
    brandingSnapshot: branding ? JSON.stringify(branding) : null,
    items: draft.items,
  });

  return { pdf, number: issuingSeries ? formatInvoiceNumber(issuingSeries) : null };
}

/**
 * The PDF of a saved proforma. Nothing is frozen on it, it can still change until it has its invoice: it is drawn with
 * the seller and the customer as they are now, so it needs the fiscal profile to say who it comes from.
 */
export async function renderProformaPdf({ db, organizationId, invoice }: { db: Database; organizationId: string; invoice: StoredProforma }) {
  const invoicingRepository = createInvoicingRepository({ db });
  const [{ profile }, { branding }, salesRepresentative] = await Promise.all([
    invoicingRepository.getFiscalProfile({ organizationId }),
    invoicingRepository.getBranding({ organizationId }),
    invoice.salesRepresentativeId === null ? null : createContactsRepository({ db }).getContact({ organizationId, contactId: invoice.salesRepresentativeId }),
  ]);

  if (!profile) {
    throw createFiscalProfileRequiredError();
  }

  return renderInvoicePdf({
    ...invoice,
    number: null,
    isProforma: true,
    sellerSnapshot: JSON.stringify(profile),
    customerSnapshot: JSON.stringify(invoice.customer),
    salesRepresentativeSnapshot: salesRepresentative?.contact ? JSON.stringify(salesRepresentative.contact) : null,
    brandingSnapshot: branding ? JSON.stringify(branding) : null,
  });
}
