import type { Invoice } from '../invoicing.types';

export function canDeleteInvoice(invoice: Pick<Invoice, 'status' | 'importedAt'>) {
  return invoice.status === 'draft' || invoice.importedAt != null;
}
