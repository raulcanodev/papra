import { onCleanup } from 'solid-js';
import { THEME_ATTRIBUTE } from './theme.constants';

/** Pins the document to the light theme while the calling component is mounted, then restores the previous one. */
export function useForcedLightTheme() {
  const root = document.documentElement;
  const previousTheme = root.getAttribute(THEME_ATTRIBUTE);

  root.setAttribute(THEME_ATTRIBUTE, 'light');

  onCleanup(() => {
    if (previousTheme) {
      root.setAttribute(THEME_ATTRIBUTE, previousTheme);
    } else {
      root.removeAttribute(THEME_ATTRIBUTE);
    }
  });
}
