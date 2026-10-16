import type { GestoriaActivity, GestoriaClient, GestoriaClientBooksActivity, GestoriaSummary } from './gestorias.types';
import type { AsDto } from '@/modules/shared/http/http-client.types';
import type { Quarter } from '@/modules/taxes/taxes.types';
import { apiClient } from '@/modules/shared/http/api-client';

const basePath = (gestoriaId: string) => `/api/gestorias/${gestoriaId}`;

export async function fetchUserGestorias() {
  return apiClient<{ gestorias: GestoriaSummary[] }>({ method: 'GET', path: '/api/gestorias' });
}

export async function fetchGestoria({ gestoriaId }: { gestoriaId: string }) {
  return apiClient<{ gestoria: GestoriaSummary; clients: GestoriaClient[] }>({ method: 'GET', path: basePath(gestoriaId) });
}

export function getGestoriaQueryKey({ gestoriaId }: { gestoriaId: string }) {
  return ['gestorias', gestoriaId];
}

function toBooksActivity(dto: AsDto<GestoriaClientBooksActivity> | null): GestoriaClientBooksActivity | null {
  return dto && ({
    ...dto,
    lastUpdatedAt: dto.lastUpdatedAt ? new Date(dto.lastUpdatedAt) : null,
  });
}

export async function fetchGestoriaActivity({ gestoriaId, year, quarter }: { gestoriaId: string; year: number; quarter: Quarter }) {
  const { period, activity } = await apiClient<AsDto<GestoriaActivity>>({ method: 'GET', path: `${basePath(gestoriaId)}/activity`, query: { year, quarter } });

  return {
    period: { ...period, start: new Date(period.start), end: new Date(period.end) },
    activity: activity.map(item => ({ ...item, issued: toBooksActivity(item.issued), received: toBooksActivity(item.received) })),
  } as GestoriaActivity;
}

/** Base path of the read-only API of a client company, used by the module services */
export function getGestoriaClientApiPath({ gestoriaId, organizationId }: { gestoriaId: string; organizationId: string }) {
  return `${basePath(gestoriaId)}/clients/${organizationId}`;
}
