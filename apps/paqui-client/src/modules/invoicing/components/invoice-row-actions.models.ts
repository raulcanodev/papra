import type { Invoice } from '../invoicing.types';

export function canDeleteInvoice(invoice: Pick<Invoice, 'status' | 'importedAt'>) {
  return invoice.status === 'draft' || invoice.status === 'proforma' || invoice.importedAt != null;
}

// Where a proforma stands: it keeps its status for good, this comes from what has been done with it
export function getProformaState(proforma: Pick<Invoice, 'sentAt' | 'convertedInvoiceId'>) {
  if (proforma.convertedInvoiceId !== null) {
    return 'converted' as const;
  }

  return proforma.sentAt === null ? 'draft' as const : 'sent' as const;
}
