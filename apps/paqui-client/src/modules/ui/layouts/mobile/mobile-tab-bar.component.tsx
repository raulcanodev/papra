import type { Component } from 'solid-js';
import type { MobileTab } from '@/modules/ui/navigation/mobile-navigation';
import { A, useLocation, useParams } from '@solidjs/router';
import { createSignal, For } from 'solid-js';
import { useI18n } from '@/modules/i18n/i18n.provider';
import { cn } from '@/modules/shared/style/cn';
import { getActiveMobileTab, getMobileTabs } from '@/modules/ui/navigation/mobile-navigation';
import { getOrganizationRouteHref, organizationRouteLabelKeys } from '@/modules/ui/navigation/organization-navigation';
import { useNavigationCapabilities } from '@/modules/ui/navigation/use-navigation-capabilities';
import { MobileQuickActions } from './mobile-quick-actions.component';

// The bottom bar of the phone, in place of the side menu of the computer (hidden from `md` up)
export const MobileTabBar: Component = () => {
  const params = useParams();
  const location = useLocation();
  const { t } = useI18n();
  const getCapabilities = useNavigationCapabilities();
  const [isQuickActionsOpen, setIsQuickActionsOpen] = createSignal(false);

  const getTabs = () => getMobileTabs({ capabilities: getCapabilities() });
  const getActiveTab = () => getActiveMobileTab({ organizationId: params.organizationId, pathname: location.pathname, tabs: getTabs() });

  const renderTab = (tab: MobileTab) => (
    <A
      href={getOrganizationRouteHref({ organizationId: params.organizationId, routeId: tab.routeId })}
      aria-current={getActiveTab() === tab.routeId ? 'page' : undefined}
      class={cn(
        'flex min-w-0 flex-col items-center justify-center gap-0.5 rounded-xl text-[11px] font-medium text-muted-foreground transition-colors',
        getActiveTab() === tab.routeId && 'font-semibold text-foreground',
      )}
    >
      <div class={cn(tab.icon, 'size-6')} />
      <span class="max-w-full truncate">{t(organizationRouteLabelKeys[tab.routeId])}</span>
    </A>
  );

  return (
    <>
      <nav
        aria-label={t('layout.mobile.navigation')}
        class="fixed inset-x-0 bottom-0 z-40 grid h-[calc(4rem+env(safe-area-inset-bottom))] grid-cols-5 border-t border-border/80 bg-background/90 px-2 pb-[env(safe-area-inset-bottom)] backdrop-blur-xl md:hidden"
      >
        <For each={getTabs().slice(0, 2)}>{renderTab}</For>

        <button
          type="button"
          onClick={() => setIsQuickActionsOpen(true)}
          aria-label={t('layout.mobile.quick-actions.open')}
          aria-haspopup="dialog"
          class="flex size-13 self-center justify-self-center items-center justify-center rounded-full bg-primary text-primary-foreground shadow-lg transition-transform active:scale-95"
        >
          <div class="i-tabler-plus size-6.5" />
        </button>

        <For each={getTabs().slice(2)}>{renderTab}</For>
      </nav>

      <MobileQuickActions open={isQuickActionsOpen()} onOpenChange={setIsQuickActionsOpen} />
    </>
  );
};
