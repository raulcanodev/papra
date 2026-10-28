/* @refresh reload */

import { Router } from '@solidjs/router';
import { QueryClientProvider } from '@tanstack/solid-query';

import { lazy, Suspense } from 'solid-js';
import { render } from 'solid-js/web';
import { ImpersonationBanner } from './modules/admin/impersonation/components/impersonation-banner.component';
import { readSessionHint } from './modules/auth/session-hint';
import { CommandPaletteProvider } from './modules/command-palette/command-palette.provider';
import { applyBrandMetadata } from './modules/config/branding';
import { isDemoMode } from './modules/config/config';
import { ConfigProvider } from './modules/config/config.provider';
import { RenameDocumentDialogProvider } from './modules/documents/components/rename-document-button.component';
import { I18nProvider } from './modules/i18n/i18n.provider';
import { PwaUpdateToast } from './modules/pwa/components/pwa-update-toast.component';
import { listenForInstallPrompt } from './modules/pwa/pwa.install';
import { registerServiceWorker } from './modules/pwa/pwa.service-worker';
import { ConfirmModalProvider } from './modules/shared/confirm';
import { queryClient } from './modules/shared/query/query-client';
import { ThemeProvider } from './modules/theme/theme.provider';
import { IdentifyUser } from './modules/tracking/components/identify-user.component';
import { PageViewTracker } from './modules/tracking/components/pageview-tracker.component';
import { AppLoader } from './modules/ui/components/app-loader';
import { Toaster } from './modules/ui/components/sonner';
import { trackKeyboardViewport } from './modules/ui/viewport/keyboard-viewport';
import { routes } from './routes';
import 'virtual:uno.css';
import './app.css';

applyBrandMetadata();
trackKeyboardViewport();

// Installable app: the browser offers the installation once, early, so it is caught from the start.
// No service worker in development (it would serve stale modules) nor in the public demo.
listenForInstallPrompt();
if (import.meta.env.PROD && !isDemoMode) {
  registerServiceWorker();
}

// After a deploy, a tab still running the previous build asks for chunks that no longer exist.
// Reload once to pick up the new build instead of leaving a broken page (guarded to never loop).
window.addEventListener('vite:preloadError', (event) => {
  event.preventDefault();

  const RELOAD_KEY = 'app:last-preload-reload';
  const lastReload = Number(sessionStorage.getItem(RELOAD_KEY) ?? 0);

  if (Date.now() - lastReload > 10_000) {
    sessionStorage.setItem(RELOAD_KEY, String(Date.now()));
    window.location.reload();
  }
});

const DemoIndicator = isDemoMode
  ? lazy(() => import('./modules/demo/demo.provider').then(mod => ({ default: mod.DemoIndicator })))
  : null;

// Local development only: never part of a production build.
const DevTools = import.meta.env.DEV
  ? lazy(() => import('./modules/dev-tools/dev-tools.component').then(mod => ({ default: mod.DevTools })))
  : null;

// The static splash of index.html covered the boot: from here the app shows its own loader
document.querySelector('.app-splash')?.remove();

render(
  () => {
    return (
      <QueryClientProvider client={queryClient}>
        <Router
          children={routes}
          root={props => (
            // Members keep the beating logo of the splash while the translations load; visitors get no loader at all
            <Suspense fallback={readSessionHint() ? <AppLoader label="Loading" /> : null}>
              <PageViewTracker />
              <IdentifyUser />
              <I18nProvider>
                <ConfirmModalProvider>
                  <ThemeProvider>
                    <CommandPaletteProvider>
                      <ConfigProvider>
                        <ImpersonationBanner />
                        <RenameDocumentDialogProvider>
                          <div class="min-h-screen font-sans text-sm font-400">
                            {props.children}
                          </div>
                        </RenameDocumentDialogProvider>
                        {DemoIndicator && <DemoIndicator />}
                        {DevTools && <DevTools />}
                      </ConfigProvider>

                      <Toaster />
                      <PwaUpdateToast />
                    </CommandPaletteProvider>
                  </ThemeProvider>

                </ConfirmModalProvider>
              </I18nProvider>
            </Suspense>
          )}
        />
      </QueryClientProvider>
    );
  },
  document.getElementById('root')!,
);
