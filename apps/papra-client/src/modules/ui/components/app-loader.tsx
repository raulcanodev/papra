import type { Component } from 'solid-js';

/**
 * Full screen loader: the Paqui logo beating like a heart. index.html shows the same markup before the app
 * boots, so a reload goes from the static splash to this one without any visual jump.
 */
export const AppLoader: Component<{ label: string }> = props => (
  <div class="min-h-screen grid place-items-center" role="status" aria-label={props.label}>
    <img src="/logo.svg" alt="" class="app-loader-logo size-14 [image-rendering:pixelated]" />
  </div>
);
