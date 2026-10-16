import type { Invoice } from '@/modules/invoicing/invoicing.types';
import type { AsDto } from '@/modules/shared/http/http-client.types';
import { coerceInvoice } from '@/modules/invoicing/invoicing.services';
import { downloadFile } from '@/modules/shared/files/download';
import { apiClient } from '@/modules/shared/http/api-client';
import { getGestoriaClientApiPath } from '../../gestorias.services';

type ClientParams = { gestoriaId: string; organizationId: string };

export async function fetchClientInvoices({ gestoriaId, organizationId }: ClientParams) {
  const { invoices } = await apiClient<{ invoices: AsDto<Invoice>[] }>({ method: 'GET', path: `${getGestoriaClientApiPath({ gestoriaId, organizationId })}/invoices` });

  return { invoices: invoices.map(coerceInvoice) };
}

export async function downloadClientInvoicePdf({ gestoriaId, organizationId, invoiceId, fileName }: ClientParams & { invoiceId: string; fileName: string }) {
  const blob = await apiClient<Blob, 'blob'>({ method: 'GET', path: `${getGestoriaClientApiPath({ gestoriaId, organizationId })}/invoices/${invoiceId}/pdf`, responseType: 'blob' });
  const url = URL.createObjectURL(blob);

  downloadFile({ url, fileName: `${fileName}.pdf` });
  URL.revokeObjectURL(url);
}
