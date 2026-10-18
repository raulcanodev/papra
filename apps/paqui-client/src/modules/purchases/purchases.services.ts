import type { PaymentInstalment } from '../due-dates/due-dates.types';
import type { AsDto } from '../shared/http/http-client.types';
import type { PurchaseInvoice, PurchaseInvoiceDraftInput, PurchaseInvoiceExtraction, PurchaseInvoiceStatus, PurchaseReading } from './purchases.types';
import { toPaymentInstalment } from '../due-dates/due-dates.services';
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
    instalments: (dto.instalments as unknown as AsDto<PaymentInstalment>[] | undefined)?.map(toPaymentInstalment),
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

function toExtraction(extraction: AsDto<PurchaseInvoiceExtraction>): PurchaseInvoiceExtraction {
  return {
    ...(extraction as unknown as PurchaseInvoiceExtraction),
    draft: {
      ...(extraction.draft as unknown as PurchaseInvoiceExtraction['draft']),
      issueDate: toNullableDate(extraction.draft.issueDate),
      dueDate: toNullableDate(extraction.draft.dueDate),
      instalments: extraction.draft.instalments?.map(instalment => ({ ...instalment, dueDate: new Date(instalment.dueDate) })),
    },
  };
}

const toReading = (reading: AsDto<PurchaseReading>): PurchaseReading => ({ ...(reading as unknown as PurchaseReading), extraction: reading.extraction === null ? null : toExtraction(reading.extraction) });

export function getPurchaseReadingsQueryKey({ organizationId, documentId }: { organizationId: string; documentId: string }) {
  return [...getPurchaseInvoicesQueryKey({ organizationId }), 'readings', documentId];
}

// Queued right after the upload: the AI reads them in the background, several at a time
export async function createPurchaseReadings({ organizationId, documentIds, force = false }: { organizationId: string; documentIds: string[]; force?: boolean }) {
  const { readings } = await apiClient<{ readings: AsDto<PurchaseReading>[] }>({ path: `${basePath(organizationId)}/readings`, method: 'POST', body: { documentIds, force } });

  return { readings: readings.map(toReading) };
}

export async function fetchPurchaseReadings({ organizationId, documentIds }: { organizationId: string; documentIds: string[] }) {
  const { readings } = await apiClient<{ readings: AsDto<PurchaseReading>[] }>({ path: `${basePath(organizationId)}/readings`, method: 'GET', query: { documentIds: documentIds.join(',') } });

  return { readings: readings.map(toReading) };
}

/** A document waiting in the inbox: read as an invoice to pay (forwarded by email, or uploaded and not reviewed) */
export type PurchaseInboxReading = PurchaseReading & { documentName: string | null };

export function getPurchaseInboxQueryKey({ organizationId }: { organizationId: string }) {
  return [...getPurchaseInvoicesQueryKey({ organizationId }), 'inbox'];
}

export async function fetchPurchaseInbox({ organizationId }: { organizationId: string }) {
  const { readings } = await apiClient<{ readings: AsDto<PurchaseInboxReading>[] }>({ path: `${basePath(organizationId)}/inbox`, method: 'GET' });

  return { readings: readings.map(reading => ({ ...toReading(reading), documentName: reading.documentName })) };
}

export async function dismissPurchaseInboxDocument({ organizationId, documentId }: { organizationId: string; documentId: string }) {
  await apiClient({ path: `${basePath(organizationId)}/inbox/${documentId}`, method: 'DELETE' });
}
