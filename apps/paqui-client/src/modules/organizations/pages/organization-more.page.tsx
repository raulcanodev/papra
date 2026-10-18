import type { Component } from 'solid-js';
import type { SideNavMenuItem } from '@/modules/ui/components/sidenav';
import { A, useParams } from '@solidjs/router';
import { createMemo, For, Show } from 'solid-js';
import { useI18n } from '@/modules/i18n/i18n.provider';
import { useMemberPreferences } from '@/modules/preferences/use-member-preferences';
import { usePwaInstall } from '@/modules/pwa/pwa.install';
import { cn } from '@/modules/shared/style/cn';
import { buildMobileMoreSections, getMobileTabs } from '@/modules/ui/navigation/mobile-navigation';
import { getOrganizationRouteHref } from '@/modules/ui/navigation/organization-navigation';
import { useNavigationCapabilities } from '@/modules/ui/navigation/use-navigation-capabilities';
import { useOrganizationFooterMenu } from '@/modules/ui/navigation/use-organization-footer-menu';
import { UserSettingsDropdown } from '@/modules/users/components/user-settings.component';
import { useCurrentUser } from '@/modules/users/composables/useCurrentUser';
import { OrganizationSwitcher } from '../components/organization-switcher.component';

const MenuList: Component<{ items: SideNavMenuItem[] }> = props => (
  <div class="divide-y border-y">
    <For each={props.items}>
      {item => (
        <A href={item.href ?? '#'} class="flex min-h-12 items-center gap-3 py-2 text-[15px] font-medium active:bg-accent">
          <span class="flex size-8 shrink-0 items-center justify-center rounded-lg bg-muted text-foreground/80">
            <div class={cn(item.icon, 'size-4.5')} />
          </span>
          <span class="min-w-0 flex-1 truncate">{item.label}</span>
          <div class="i-tabler-chevron-right size-4 shrink-0 text-muted-foreground/70" />
        </A>
      )}
    </For>
  </div>
);

// Phones only (the bottom bar links here): every page that has no tab, the organization and the account
export const OrganizationMorePage: Component = () => {
  const params = useParams();
  const { t } = useI18n();
  const { user } = useCurrentUser();
  const getCapabilities = useNavigationCapabilities();
  const { getPreferences } = useMemberPreferences();
  const getFooterMenuItems = useOrganizationFooterMenu();
  const { isInstalled } = usePwaInstall();

  const getSections = createMemo(() => buildMobileMoreSections({
    organizationId: params.organizationId,
    capabilities: getCapabilities(),
    translate: t,
    hiddenItemIds: getPreferences().navigation.hiddenItemIds,
    tabs: getMobileTabs({ capabilities: getCapabilities() }),
  }));

  return (
    <div class="page-narrow flex flex-col gap-6">
      <h1 class="page-title">{t('navigation.item.more')}</h1>

      <OrganizationSwitcher class="-mx-2 w-[calc(100%+1rem)]" triggerClass="h-13 w-full hover:bg-accent data-[expanded]:bg-accent" />

      <Show when={!isInstalled()}>
        <A
          href={getOrganizationRouteHref({ organizationId: params.organizationId, routeId: 'settingsApp' })}
          class="flex items-center gap-3 rounded-2xl bg-primary p-3.5 text-primary-foreground"
        >
          <div class="i-tabler-device-mobile-down size-6 shrink-0" />
          <span class="min-w-0 flex-1">
            <span class="block text-[15px] font-semibold">{t('layout.mobile.more.install')}</span>
            <span class="block text-sm opacity-80">{t('layout.mobile.more.install.description')}</span>
          </span>
          <div class="i-tabler-chevron-right size-4 shrink-0 opacity-70" />
        </A>
      </Show>

      <For each={getSections()}>
        {section => (
          <section class="flex flex-col gap-2">
            <Show when={section.label}>
              <h2 class="text-xs font-semibold uppercase tracking-wide text-muted-foreground">{section.label}</h2>
            </Show>
            <MenuList items={section.items} />
          </section>
        )}
      </For>

      <MenuList items={getFooterMenuItems()} />

      <UserSettingsDropdown userId={user.id} userName={user.name} userEmail={user.email} class="-mx-2 hover:bg-accent data-[expanded]:bg-accent" />
    </div>
  );
};
