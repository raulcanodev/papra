import type { MemberPreferences, MemberPreferencesPatch } from './preferences.types';
import { useParams } from '@solidjs/router';
import { useQuery } from '@tanstack/solid-query';
import { queryClient } from '../shared/query/query-client';
import { applyPreferencesPatch } from './preferences.models';
import { fetchMemberPreferences, updateMemberPreferences } from './preferences.services';
import { DEFAULT_MEMBER_PREFERENCES } from './preferences.types';

const getQueryKey = (organizationId: string) => ['organizations', organizationId, 'preferences'];

// How the current member laid out this workspace (home cards, menu entries). Changes show instantly and are saved
// in the background; if saving fails the server state comes back.
export function useMemberPreferences() {
  const params = useParams();

  const query = useQuery(() => ({
    queryKey: getQueryKey(params.organizationId),
    queryFn: () => fetchMemberPreferences({ organizationId: params.organizationId }),
    staleTime: Number.POSITIVE_INFINITY,
  }));

  const getPreferences = (): MemberPreferences => query.data?.preferences ?? DEFAULT_MEMBER_PREFERENCES;

  const updatePreferences = async (patch: MemberPreferencesPatch) => {
    const organizationId = params.organizationId;
    const queryKey = getQueryKey(organizationId);

    queryClient.setQueryData(queryKey, { preferences: applyPreferencesPatch({ preferences: getPreferences(), patch }) });

    try {
      queryClient.setQueryData(queryKey, await updateMemberPreferences({ organizationId, patch }));
    } catch {
      await queryClient.invalidateQueries({ queryKey });
    }
  };

  return { getPreferences, updatePreferences, isLoaded: () => query.data !== undefined };
}
