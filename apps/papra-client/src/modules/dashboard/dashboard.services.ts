import type { DashboardMetrics } from './dashboard.types';
import { apiClient } from '../shared/http/api-client';

export async function fetchDashboardMetrics({ organizationId, year }: { organizationId: string; year?: number }) {
  const { metrics } = await apiClient<{ metrics: DashboardMetrics }>({
    path: `/api/organizations/${organizationId}/dashboard/metrics${year ? `?year=${year}` : ''}`,
    method: 'GET',
  });

  return { metrics };
}
