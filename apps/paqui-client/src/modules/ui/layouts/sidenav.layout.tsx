import type { Component, ParentComponent } from 'solid-js';
import { makePersisted } from '@solid-primitives/storage';
import { useParams } from '@solidjs/router';
import { createSignal, For, onCleanup, Show, Suspense } from 'solid-js';

import { useDocumentUpload } from '@/modules/documents/components/document-import-status.component';
import { GlobalDropArea } from '@/modules/documents/components/global-drop-area.component';
import { useI18n } from '@/modules/i18n/i18n.provider';
import { cn } from '@/modules/shared/style/cn';
import { UsageWarningCard } from '@/modules/subscriptions/components/usage-warning-card';
import { Button } from '@/modules/ui/components/button';
import { DropdownMenuRadioGroup, DropdownMenuRadioItem } from '../components/dropdown-menu';
import { Sheet, SheetContent, SheetTrigger } from '../components/sheet';

export const LanguageSwitcher: Component = () => {
  const { getLocale, setLocale, locales } = useI18n();
  const languageName = new Intl.DisplayNames(getLocale(), {
    type: 'language',
    languageDisplay: 'standard',
  });

  return (
    <DropdownMenuRadioGroup value={getLocale()} onChange={setLocale}>
      <For each={locales}>
        {locale => (
          <DropdownMenuRadioItem value={locale.key} disabled={getLocale() === locale.key}>
            <span translate="no" lang={getLocale() === locale.key ? undefined : locale.key}>
              {locale.name}
            </span>
            <Show when={getLocale() !== locale.key}>
              <span class="text-muted-foreground pl-1">
                (
                {languageName.of(locale.key)}
                )
              </span>
            </Show>
          </DropdownMenuRadioItem>
        )}
      </For>
    </DropdownMenuRadioGroup>
  );
};

/**
 * Dashboard shell: a sidebar on the app canvas and the workspace as an inset, rounded panel.
 * Pages choose their own width with the `page`, `page-narrow` or `page-full` shortcuts.
 * Below `md`, a shell given `mobileHeader` and `mobileNav` swaps the side menu for a phone layout (header on top,
 * bottom bar); the others keep the side menu in a drawer.
 */
export const AppShell: ParentComponent<{
  sideNav: Component;
  header?: Component;
  banner?: Component;
  aside?: Component;
  isSidebarOpen?: () => boolean;
  onToggleSidebar?: () => void;
  mobileHeader?: Component;
  mobileNav?: Component;
}> = (props) => {
  const { t } = useI18n();
  const [isMobileNavOpen, setIsMobileNavOpen] = createSignal(false);
  const isSidebarOpen = () => props.isSidebarOpen?.() ?? true;

  return (
    <div class="flex h-dvh min-h-0 w-full bg-sidebar pt-[env(safe-area-inset-top)] text-sidebar-foreground">
      <div class={cn('hidden shrink-0 overflow-hidden transition-[width] duration-200 ease-linear md:block', isSidebarOpen() ? 'w-64' : 'w-0')}>
        <div class="h-full w-64">
          <props.sideNav />
        </div>
      </div>

      <div class={cn('flex min-w-0 flex-1 transition-[padding] duration-200 ease-linear md:p-2', isSidebarOpen() && 'md:pl-0')}>
        <div class="relative flex min-w-0 flex-1 overflow-hidden bg-background text-foreground md:(rounded-xl border border-border/80 shadow-xs) dark:shadow-none">
          <div class="flex min-w-0 flex-1 flex-col">
            {props.banner && <props.banner />}

            {props.mobileHeader && (
              <header class="flex h-14 shrink-0 items-center gap-1 border-b border-border/80 pl-2 pr-3 md:hidden">
                <props.mobileHeader />
              </header>
            )}

            <header class={cn('flex h-12 shrink-0 items-center gap-2 border-b border-border/80 px-4 lg:px-6', props.mobileHeader && 'hidden md:flex')}>
              <Show when={props.onToggleSidebar}>
                <Button
                  variant="ghost"
                  size="icon-sm"
                  class="hidden -ml-2 size-7 text-muted-foreground md:inline-flex"
                  onClick={() => props.onToggleSidebar?.()}
                  aria-label={t('layout.shell.toggle-sidebar')}
                >
                  <div class="i-tabler-layout-sidebar size-4" />
                </Button>
              </Show>

              <div class="md:hidden">
                <Sheet open={isMobileNavOpen()} onOpenChange={setIsMobileNavOpen}>
                  <SheetTrigger as={Button} variant="ghost" size="icon-sm" class="-ml-2 size-7" aria-label={t('layout.shell.open-navigation')}>
                    <div class="i-tabler-layout-sidebar size-4" />
                  </SheetTrigger>
                  <SheetContent side="left" class="bg-sidebar p-0!" onClick={(event: MouseEvent) => (event.target as HTMLElement).closest('a[href]') && setIsMobileNavOpen(false)}>
                    <props.sideNav />
                  </SheetContent>
                </Sheet>
              </div>

              <div class={cn('mx-1 h-4 w-px bg-border', !props.onToggleSidebar && 'md:hidden')} />
              {props.header && <props.header />}
            </header>

            {/* Room for the bottom bar, so the end of every page stays reachable above it */}
            <main class={cn('relative min-h-0 flex-1 overflow-y-auto', props.mobileNav && 'pb-[calc(4rem+env(safe-area-inset-bottom))] md:pb-0')}>
              <Suspense>
                {props.children}
              </Suspense>
            </main>
          </div>

          {props.aside && <props.aside />}
        </div>
      </div>

      {props.mobileNav && <props.mobileNav />}
    </div>
  );
};

export const ShellBreadcrumb: Component<{ parent?: string; title?: string }> = (props) => {
  const { t } = useI18n();

  return (
    <nav aria-label={t('layout.shell.breadcrumb')} class="flex min-w-0 items-center gap-1.5 text-sm">
      <Show when={props.parent}>
        <span class="hidden truncate text-muted-foreground sm:inline">{props.parent}</span>
        <span class="hidden text-muted-foreground/60 sm:inline">/</span>
      </Show>
      <span class="truncate font-medium">{props.title}</span>
    </nav>
  );
};

export const SidenavLayout: ParentComponent<{
  sideNav: Component;
  header?: Component;
  rightPanel?: Component;
  isRightPanelOpen?: () => boolean;
  mobileHeader?: Component;
  mobileNav?: Component;
}> = (props) => {
  const params = useParams();
  const { uploadDocuments } = useDocumentUpload();
  const { t } = useI18n();
  const [isSidebarOpen, setIsSidebarOpen] = makePersisted(createSignal(true), {
    name: 'paqui:workspace-sidebar-open',
    storage: localStorage,
  });
  const [rightPanelWidth, setRightPanelWidth] = makePersisted(createSignal(430), {
    name: 'paqui:ai-assistant:panel-width',
    storage: localStorage,
  });

  let stopPanelResize: (() => void) | undefined;

  const startPanelResize = (event: PointerEvent) => {
    event.preventDefault();

    const initialX = event.clientX;
    const initialWidth = rightPanelWidth();
    const onPointerMove = (moveEvent: PointerEvent) => {
      setRightPanelWidth(Math.min(720, Math.max(360, initialWidth + initialX - moveEvent.clientX)));
    };

    stopPanelResize?.();
    stopPanelResize = () => {
      document.removeEventListener('pointermove', onPointerMove);
      document.removeEventListener('pointerup', stopPanelResize!);
      document.body.style.removeProperty('cursor');
      document.body.style.removeProperty('user-select');
      stopPanelResize = undefined;
    };

    document.body.style.cursor = 'col-resize';
    document.body.style.userSelect = 'none';
    document.addEventListener('pointermove', onPointerMove);
    document.addEventListener('pointerup', stopPanelResize);
  };

  onCleanup(() => stopPanelResize?.());

  return (
    <AppShell
      sideNav={props.sideNav}
      header={props.header}
      isSidebarOpen={isSidebarOpen}
      onToggleSidebar={() => setIsSidebarOpen(value => !value)}
      mobileHeader={props.mobileHeader}
      mobileNav={props.mobileNav}
      banner={() => <UsageWarningCard organizationId={params.organizationId} />}
      aside={() => (
        <Show when={props.rightPanel && (props.isRightPanelOpen?.() ?? true)}>
          <aside
            class="fixed inset-0 z-50 flex h-dvh min-h-0 w-full shrink-0 overflow-hidden bg-card pt-[env(safe-area-inset-top)] md:(relative h-full pt-0 z-auto w-[var(--right-panel-width)] max-w-[55vw] border-l)"
            style={{ '--right-panel-width': `${rightPanelWidth()}px` }}
          >
            <button
              type="button"
              class="absolute inset-y-0 left-0 z-10 hidden w-1 -translate-x-1/2 cursor-col-resize bg-transparent transition-colors hover:bg-ring/40 md:block"
              onPointerDown={startPanelResize}
              aria-label={t('layout.shell.resize-panel')}
            />
            {props.rightPanel && <props.rightPanel />}
          </aside>
        </Show>
      )}
    >
      <GlobalDropArea onFilesDrop={uploadDocuments} />
      {props.children}
    </AppShell>
  );
};
