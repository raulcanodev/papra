import type { ParentComponent } from 'solid-js';
import { useQuery } from '@tanstack/solid-query';
import { createContext, useContext } from 'solid-js';
import { apiClient } from '../shared/http/api-client';

type FeatureFlagId = string;

async function fetchFeatureFlags() {
  const { featureFlags } = await apiClient<{ featureFlags: FeatureFlagId[] }>({
    path: '/api/feature-flags',
    method: 'GET',
  });
  return { featureFlags };
}

const FeatureFlagsContext = createContext<{
  hasFlag: (flagId: string) => boolean;
  flags: FeatureFlagId[];
}>();

export function useFeatureFlags() {
  const context = useContext(FeatureFlagsContext);

  if (!context) {
    throw new Error('useFeatureFlags must be used within FeatureFlagsProvider');
  }

  return context;
}

export const FeatureFlagsProvider: ParentComponent = (props) => {
  const query = useQuery(() => ({
    queryKey: ['feature-flags'],
    queryFn: fetchFeatureFlags,
    refetchOnWindowFocus: false,
  }));

  return (
    <FeatureFlagsContext.Provider
      value={{
        flags: query.data?.featureFlags ?? [],
        hasFlag: (flagId: string) => query.data?.featureFlags.includes(flagId) ?? false,
      }}
    >
      {props.children}
    </FeatureFlagsContext.Provider>
  );
};
