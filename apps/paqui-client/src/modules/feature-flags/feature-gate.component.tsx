import type { JSX, ParentComponent } from 'solid-js';
import { Show } from 'solid-js';
import { useFeatureFlags } from './feature-flags.provider';

export const FeatureGate: ParentComponent<{ flagId: string; fallback?: JSX.Element }> = (props) => {
  const { hasFlag } = useFeatureFlags();

  return (
    <Show when={hasFlag(props.flagId)} fallback={props.fallback}>
      {props.children}
    </Show>
  );
};
