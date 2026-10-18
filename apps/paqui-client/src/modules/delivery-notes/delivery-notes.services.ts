import type { Invoice } from '../invoicing/invoicing.types';
import type { AsDto } from '../shared/http/http-client.types';
import type { DeliveryNote, DeliveryNoteDraftInput, DeliveryNoteReading, DeliveryNoteStatus } from './delivery-notes.types';
import { coerceInvoice } from '../invoicing/invoicing.services';
import { apiClient } from '../shared/http/api-client';

const basePath = (organizationId: string) => `/api/organizations/${organizationId}/delivery-notes`;

function toDeliveryNote(dto: AsDto<DeliveryNote>): DeliveryNote {
  return {
    ...(dto as unknown as DeliveryNote),
    date: new Date(dto.date),
    createdAt: new Date(dto.createdAt),
    updatedAt: new Date(dto.updatedAt),
  };
}

export function getDeliveryNotesQueryKey({ organizationId }: { organizationId: string }) {
  return ['organizations', organizationId, 'delivery-notes'];
}

// Apart from the delivery notes: refreshing the list never reads a photo again
export function getDeliveryNoteReadingQueryKey({ organizationId, documentId }: { organizationId: string; documentId: string }) {
  return ['organizations', organizationId, 'delivery-note-readings', documentId];
}

export async function fetchDeliveryNotes({ organizationId, status, customerId }: { organizationId: string; status?: DeliveryNoteStatus; customerId?: string }) {
  const { deliveryNotes } = await apiClient<{ deliveryNotes: AsDto<DeliveryNote>[] }>({ path: basePath(organizationId), method: 'GET', query: { status, customerId } });

  return { deliveryNotes: deliveryNotes.map(toDeliveryNote) };
}

export async function fetchDeliveryNote({ organizationId, deliveryNoteId }: { organizationId: string; deliveryNoteId: string }) {
  const { deliveryNote } = await apiClient<{ deliveryNote: AsDto<DeliveryNote> }>({ path: `${basePath(organizationId)}/${deliveryNoteId}`, method: 'GET' });

  return { deliveryNote: toDeliveryNote(deliveryNote) };
}

export async function createDeliveryNote({ organizationId, deliveryNote }: { organizationId: string; deliveryNote: DeliveryNoteDraftInput }) {
  const result = await apiClient<{ deliveryNote: AsDto<DeliveryNote> }>({ path: basePath(organizationId), method: 'POST', body: deliveryNote });

  return { deliveryNote: toDeliveryNote(result.deliveryNote) };
}

export async function updateDeliveryNote({ organizationId, deliveryNoteId, deliveryNote }: { organizationId: string; deliveryNoteId: string; deliveryNote: DeliveryNoteDraftInput }) {
  const result = await apiClient<{ deliveryNote: AsDto<DeliveryNote> }>({ path: `${basePath(organizationId)}/${deliveryNoteId}`, method: 'PUT', body: deliveryNote });

  return { deliveryNote: toDeliveryNote(result.deliveryNote) };
}

export async function deleteDeliveryNote({ organizationId, deliveryNoteId }: { organizationId: string; deliveryNoteId: string }) {
  await apiClient({ path: `${basePath(organizationId)}/${deliveryNoteId}`, method: 'DELETE' });
}

/** Reads the photo (already uploaded as a document) and proposes the delivery note prefilled, nothing is saved */
export async function readDeliveryNote({ organizationId, documentId }: { organizationId: string; documentId: string }) {
  return apiClient<{ reading: DeliveryNoteReading }>({ path: `${basePath(organizationId)}/read`, method: 'POST', body: { documentId } });
}

/** The PDF to print, opened in a tab the caller opened on the click (a tab opened after waiting is blocked) */
export async function openDeliveryNotePdf({ organizationId, deliveryNoteId, target }: { organizationId: string; deliveryNoteId: string; target: Window | null }) {
  const blob = await apiClient<Blob, 'blob'>({ path: `${basePath(organizationId)}/${deliveryNoteId}/pdf`, method: 'GET', responseType: 'blob' });
  const url = URL.createObjectURL(new Blob([blob], { type: 'application/pdf' }));

  if (target) {
    target.location.href = url;
    return;
  }

  window.open(url, '_blank');
}

/** Several delivery notes of one customer become a draft invoice, opened in the invoice editor to review and issue */
export async function invoiceDeliveryNotes({ organizationId, deliveryNoteIds }: { organizationId: string; deliveryNoteIds: string[] }) {
  const { invoice } = await apiClient<{ invoice: AsDto<Invoice> }>({ path: `${basePath(organizationId)}/invoice`, method: 'POST', body: { deliveryNoteIds } });

  return { invoice: coerceInvoice(invoice) };
}
