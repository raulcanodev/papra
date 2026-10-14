import type { DashboardMetrics } from './dashboard.types';
import { apiClient } from '../shared/http/api-client';

export async function fetchDashboardMetrics({ organizationId }: { organizationId: string }) {
  const { metrics } = await apiClient<{ metrics: DashboardMetrics }>({
    path: `/api/organizations/${organizationId}/dashboard/metrics`,
    method: 'GET',
  });

  return { metrics };
}
