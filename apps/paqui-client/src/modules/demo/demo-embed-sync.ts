import type { Locale } from '../i18n/i18n.provider';
import { onCleanup, onMount } from 'solid-js';
import { useI18n } from '../i18n/i18n.provider';
import { useTheme } from '../theme/theme.provider';
import { DEMO_DEFAULT_PARENT_ORIGINS, DEMO_PREFERENCES_MESSAGE_SOURCE } from './demo.constants';

const allowedParentOrigins = (import.meta.env.VITE_DEMO_FRAME_ANCESTORS ?? DEMO_DEFAULT_PARENT_ORIGINS).split(/\s+/).filter(Boolean);

function isAllowedOrigin(origin: string) {
  return allowedParentOrigins.some((allowedOrigin: string) => {
    if (allowedOrigin === 'http://localhost:*') {
      return /^http:\/\/localhost:\d+$/.test(origin);
    }
    if (allowedOrigin === 'http://127.0.0.1:*') {
      return /^http:\/\/127\.0\.0\.1:\d+$/.test(origin);
    }

    return allowedOrigin === origin;
  });
}

/** When the demo is embedded in the landing page, follow the theme and language chosen there. */
export function useDemoEmbedSync() {
  const { setThemePreference } = useTheme();
  const { setLocale, locales } = useI18n();

  const apply = ({ theme, locale }: { theme?: unknown; locale?: unknown }) => {
    if (theme === 'light' || theme === 'dark') {
      setThemePreference(theme);
    }
    if (typeof locale === 'string' && locales.some(item => item.key === locale)) {
      setLocale(locale as Locale);
    }
  };

  onMount(() => {
    if (window.parent === window) {
      return;
    }

    // First paint: the landing passes its current preferences in the URL
    const params = new URLSearchParams(window.location.search);
    apply({ theme: params.get('theme'), locale: params.get('lang') });

    const onMessage = (event: MessageEvent) => {
      if (event.source !== window.parent || !isAllowedOrigin(event.origin) || event.data?.source !== DEMO_PREFERENCES_MESSAGE_SOURCE) {
        return;
      }

      apply({ theme: event.data.theme, locale: event.data.locale });
    };

    window.addEventListener('message', onMessage);
    onCleanup(() => window.removeEventListener('message', onMessage));
  });
}
