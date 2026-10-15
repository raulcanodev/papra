/* @refresh reload */

import { Router } from '@solidjs/router';
import { QueryClientProvider } from '@tanstack/solid-query';

import { lazy, Suspense } from 'solid-js';
import { render } from 'solid-js/web';
import { CommandPaletteProvider } from './modules/command-palette/command-palette.provider';
import { applyBrandMetadata } from './modules/config/branding';
import { isDemoMode } from './modules/config/config';
import { ConfigProvider } from './modules/config/config.provider';
import { RenameDocumentDialogProvider } from './modules/documents/components/rename-document-button.component';
import { I18nProvider } from './modules/i18n/i18n.provider';
import { AboutDialogProvider } from './modules/shared/components/about-dialog';
import { ConfirmModalProvider } from './modules/shared/confirm';
import { queryClient } from './modules/shared/query/query-client';
import { ThemeProvider } from './modules/theme/theme.provider';
import { IdentifyUser } from './modules/tracking/components/identify-user.component';
import { PageViewTracker } from './modules/tracking/components/pageview-tracker.component';
import { AppLoader } from './modules/ui/components/app-loader';
import { Toaster } from './modules/ui/components/sonner';
import { routes } from './routes';
import 'virtual:uno.css';
import './app.css';

applyBrandMetadata();

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
            // Same loader as the static splash of index.html, so nothing blinks while the translations load
            <Suspense fallback={<AppLoader label="Loading" />}>
              <PageViewTracker />
              <IdentifyUser />
              <I18nProvider>
                <ConfirmModalProvider>
                  <ThemeProvider>
                    <CommandPaletteProvider>
                      <ConfigProvider>
                        <AboutDialogProvider>
                          <RenameDocumentDialogProvider>
                            <div class="min-h-screen font-sans text-sm font-400">
                              {props.children}
                            </div>
                          </RenameDocumentDialogProvider>
                          {DemoIndicator && <DemoIndicator />}
                          {DevTools && <DevTools />}
                        </AboutDialogProvider>
                      </ConfigProvider>

                      <Toaster />
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
