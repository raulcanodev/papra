import type { MemberPreferences, MemberPreferencesPatch } from './preferences.types';
import { apiClient } from '../shared/http/api-client';

export async function fetchMemberPreferences({ organizationId }: { organizationId: string }) {
  return apiClient<{ preferences: MemberPreferences }>({ path: `/api/organizations/${organizationId}/preferences`, method: 'GET' });
}

export async function updateMemberPreferences({ organizationId, patch }: { organizationId: string; patch: MemberPreferencesPatch }) {
  return apiClient<{ preferences: MemberPreferences }>({ path: `/api/organizations/${organizationId}/preferences`, method: 'PATCH', body: patch });
}
