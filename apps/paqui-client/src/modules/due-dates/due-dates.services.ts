import type { AsDto } from '../shared/http/http-client.types';
import type { DueDateDirection, DueDateSettings, InstalmentStatus, PaymentInstalment } from './due-dates.types';
import { apiClient } from '../shared/http/api-client';

const basePath = (organizationId: string) => `/api/organizations/${organizationId}/due-dates`;

const toNullableDate = (value: string | Date | null) => (value === null ? null : new Date(value));

export function toPaymentInstalment(dto: AsDto<PaymentInstalment>): PaymentInstalment {
  return {
    ...(dto as unknown as PaymentInstalment),
    dueDate: new Date(dto.dueDate),
    paidAt: toNullableDate(dto.paidAt),
    returnedAt: toNullableDate(dto.returnedAt),
    issueDate: toNullableDate(dto.issueDate),
  };
}

export function getDueDatesQueryKey({ organizationId }: { organizationId: string }) {
  return ['organizations', organizationId, 'due-dates'];
}

export async function fetchDueDates({ organizationId, direction }: { organizationId: string; direction?: DueDateDirection }) {
  const { instalments } = await apiClient<{ instalments: AsDto<PaymentInstalment>[] }>({ path: basePath(organizationId), method: 'GET', query: direction ? { direction } : undefined });

  return { instalments: instalments.map(toPaymentInstalment) };
}

export async function setInstalmentStatus({ organizationId, instalmentId, status }: { organizationId: string; instalmentId: string; status: InstalmentStatus }) {
  const { instalment } = await apiClient<{ instalment: AsDto<PaymentInstalment> }>({ path: `${basePath(organizationId)}/${instalmentId}/status`, method: 'PATCH', body: { status } });

  return { instalment: toPaymentInstalment(instalment) };
}

export function getDueDateSettingsQueryKey({ organizationId }: { organizationId: string }) {
  return [...getDueDatesQueryKey({ organizationId }), 'settings'];
}

export async function fetchDueDateSettings({ organizationId }: { organizationId: string }) {
  return apiClient<{ settings: DueDateSettings }>({ path: `${basePath(organizationId)}/settings`, method: 'GET' });
}

export async function updateDueDateSettings({ organizationId, settings }: { organizationId: string; settings: DueDateSettings }) {
  return apiClient<{ settings: DueDateSettings }>({ path: `${basePath(organizationId)}/settings`, method: 'PUT', body: settings });
}
