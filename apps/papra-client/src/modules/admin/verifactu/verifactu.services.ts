import { apiClient } from '@/modules/shared/http/api-client';

export type VerifactuSystemState = { id: string; dispatchPaused: boolean; reason: string | null; updatedAt: string };
export type VerifactuDashboard = { state: VerifactuSystemState; counts: { pending: number; rejected: number; accepted: number; total: number }; activeOrganizations: number };

export function getVerifactuDashboard() {
  return apiClient<VerifactuDashboard>({ method: 'GET', path: '/api/admin/verifactu/dashboard' });
}

export function updateVerifactuSystemState({ dispatchPaused, reason }: { dispatchPaused: boolean; reason: string | null }) {
  return apiClient<{ state: VerifactuSystemState }>({ method: 'PUT', path: '/api/admin/verifactu/system-state', body: { dispatchPaused, reason } });
}
