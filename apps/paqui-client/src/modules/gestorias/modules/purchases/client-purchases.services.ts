import type { PurchaseInvoice } from '@/modules/purchases/purchases.types';
import type { AsDto } from '@/modules/shared/http/http-client.types';
import { downloadFile } from '@/modules/shared/files/download';
import { apiClient } from '@/modules/shared/http/api-client';
import { getGestoriaClientApiPath } from '../../gestorias.services';

type ClientParams = { gestoriaId: string; organizationId: string };

function toPurchaseInvoice(dto: AsDto<PurchaseInvoice>): PurchaseInvoice {
  return {
    ...(dto as unknown as PurchaseInvoice),
    issueDate: new Date(dto.issueDate),
    dueDate: dto.dueDate === null ? null : new Date(dto.dueDate),
    paidAt: dto.paidAt === null ? null : new Date(dto.paidAt),
    createdAt: new Date(dto.createdAt),
    updatedAt: new Date(dto.updatedAt),
  };
}

export async function fetchClientPurchaseInvoices({ gestoriaId, organizationId }: ClientParams) {
  const { purchaseInvoices } = await apiClient<{ purchaseInvoices: AsDto<PurchaseInvoice>[] }>({ method: 'GET', path: `${getGestoriaClientApiPath({ gestoriaId, organizationId })}/purchases` });

  return { purchaseInvoices: purchaseInvoices.map(toPurchaseInvoice) };
}

/** The file attached to a received invoice, saved with its original name */
export async function downloadClientPurchaseDocument({ gestoriaId, organizationId, purchaseInvoiceId, fileName }: ClientParams & { purchaseInvoiceId: string; fileName: string }) {
  const blob = await apiClient<Blob, 'blob'>({ method: 'GET', path: `${getGestoriaClientApiPath({ gestoriaId, organizationId })}/purchases/${purchaseInvoiceId}/document`, responseType: 'blob' });
  const url = URL.createObjectURL(blob);

  downloadFile({ url, fileName });
  URL.revokeObjectURL(url);
}
