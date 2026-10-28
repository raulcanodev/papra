import { createContext, onCleanup, onMount, useContext } from 'solid-js';

export const AppShellContext = createContext<{ enterFullScreenOnMobile: () => () => void }>();

// While the calling component is mounted, the phone layout drops its header and bottom bar: an editor takes the whole screen
export function useFullScreenOnMobile() {
  const shell = useContext(AppShellContext);

  onMount(() => {
    const leave = shell?.enterFullScreenOnMobile();
    onCleanup(() => leave?.());
  });
}
