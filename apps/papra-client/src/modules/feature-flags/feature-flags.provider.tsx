import type { ParentComponent } from 'solid-js';
import { useQuery } from '@tanstack/solid-query';
import { createContext, Show, useContext } from 'solid-js';
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
    <Show when={query.data} fallback={props.children}>
      <FeatureFlagsContext.Provider
        value={{
          flags: query.data!.featureFlags,
          hasFlag: (flagId: string) => query.data!.featureFlags.includes(flagId),
        }}
      >
        {props.children}
      </FeatureFlagsContext.Provider>
    </Show>
  );
};
