import type { AsDto } from '../shared/http/http-client.types';
import type { PurchaseInvoice, PurchaseInvoiceDraftInput, PurchaseInvoiceExtraction, PurchaseInvoiceStatus } from './purchases.types';
import { apiClient } from '../shared/http/api-client';

const basePath = (organizationId: string) => `/api/organizations/${organizationId}/purchases`;

const toDate = (value: string | Date) => new Date(value);
const toNullableDate = (value: string | Date | null) => (value === null ? null : new Date(value));

function toPurchaseInvoice(dto: AsDto<PurchaseInvoice>): PurchaseInvoice {
  return {
    ...(dto as unknown as PurchaseInvoice),
    issueDate: toDate(dto.issueDate),
    dueDate: toNullableDate(dto.dueDate),
    paidAt: toNullableDate(dto.paidAt),
    createdAt: toDate(dto.createdAt),
    updatedAt: toDate(dto.updatedAt),
  };
}

export function getPurchaseInvoicesQueryKey({ organizationId }: { organizationId: string }) {
  return ['organizations', organizationId, 'purchases'];
}

export async function fetchPurchaseInvoices({ organizationId, status }: { organizationId: string; status?: PurchaseInvoiceStatus }) {
  const { purchaseInvoices } = await apiClient<{ purchaseInvoices: AsDto<PurchaseInvoice>[] }>({ path: basePath(organizationId), method: 'GET', query: status ? { status } : undefined });

  return { purchaseInvoices: purchaseInvoices.map(toPurchaseInvoice) };
}

export async function fetchPurchaseInvoice({ organizationId, purchaseInvoiceId }: { organizationId: string; purchaseInvoiceId: string }) {
  const { purchaseInvoice } = await apiClient<{ purchaseInvoice: AsDto<PurchaseInvoice> }>({ path: `${basePath(organizationId)}/${purchaseInvoiceId}`, method: 'GET' });

  return { purchaseInvoice: toPurchaseInvoice(purchaseInvoice) };
}

export async function createPurchaseInvoice({ organizationId, purchaseInvoice }: { organizationId: string; purchaseInvoice: PurchaseInvoiceDraftInput }) {
  const { purchaseInvoice: created } = await apiClient<{ purchaseInvoice: AsDto<PurchaseInvoice> }>({ path: basePath(organizationId), method: 'POST', body: purchaseInvoice });

  return { purchaseInvoice: toPurchaseInvoice(created) };
}

export async function updatePurchaseInvoice({ organizationId, purchaseInvoiceId, purchaseInvoice }: { organizationId: string; purchaseInvoiceId: string; purchaseInvoice: PurchaseInvoiceDraftInput }) {
  const { purchaseInvoice: updated } = await apiClient<{ purchaseInvoice: AsDto<PurchaseInvoice> }>({ path: `${basePath(organizationId)}/${purchaseInvoiceId}`, method: 'PUT', body: purchaseInvoice });

  return { purchaseInvoice: toPurchaseInvoice(updated) };
}

export async function setPurchaseInvoiceStatus({ organizationId, purchaseInvoiceId, status }: { organizationId: string; purchaseInvoiceId: string; status: PurchaseInvoiceStatus }) {
  const { purchaseInvoice } = await apiClient<{ purchaseInvoice: AsDto<PurchaseInvoice> }>({ path: `${basePath(organizationId)}/${purchaseInvoiceId}/status`, method: 'PATCH', body: { status } });

  return { purchaseInvoice: toPurchaseInvoice(purchaseInvoice) };
}

export async function deletePurchaseInvoice({ organizationId, purchaseInvoiceId }: { organizationId: string; purchaseInvoiceId: string }) {
  await apiClient({ path: `${basePath(organizationId)}/${purchaseInvoiceId}`, method: 'DELETE' });
}

export async function extractPurchaseInvoice({ organizationId, documentId }: { organizationId: string; documentId: string }) {
  const extraction = await apiClient<AsDto<PurchaseInvoiceExtraction>>({ path: `${basePath(organizationId)}/extract`, method: 'POST', body: { documentId } });

  return {
    extraction: {
      ...(extraction as unknown as PurchaseInvoiceExtraction),
      draft: { ...(extraction.draft as unknown as PurchaseInvoiceExtraction['draft']), issueDate: toNullableDate(extraction.draft.issueDate), dueDate: toNullableDate(extraction.draft.dueDate) },
    },
  };
}
