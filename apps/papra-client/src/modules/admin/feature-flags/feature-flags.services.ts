import { apiClient } from '@/modules/shared/http/api-client';

export type FeatureFlagEntry = {
  id: string;
  flagId: string;
  userEmail: string;
  createdAt: string;
};

export async function listFeatureFlagEntries(): Promise<{ entries: FeatureFlagEntry[] }> {
  return apiClient<{ entries: FeatureFlagEntry[] }>({
    path: '/api/admin/feature-flags',
    method: 'GET',
  });
}

export async function addFeatureFlagEntry({
  flagId,
  userEmail,
}: {
  flagId: string;
  userEmail: string;
}): Promise<void> {
  await apiClient({
    path: '/api/admin/feature-flags',
    method: 'POST',
    body: { flagId, userEmail },
  });
}

export async function removeFeatureFlagEntry({ entryId }: { entryId: string }): Promise<void> {
  await apiClient({
    path: `/api/admin/feature-flags/${entryId}`,
    method: 'DELETE',
  });
}
