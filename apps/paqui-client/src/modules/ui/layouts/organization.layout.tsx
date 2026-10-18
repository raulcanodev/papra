import type { Component, ParentComponent } from 'solid-js';

import type { SideNavCustomization } from '@/modules/ui/components/sidenav';
import { useLocation, useNavigate, useParams } from '@solidjs/router';
import { useQuery } from '@tanstack/solid-query';
import { createEffect, createMemo, createSignal, on, Show } from 'solid-js';
import { AiAssistantPanelProvider, useAiAssistantPanel } from '@/modules/ai-assistant/ai-assistant-panel.provider';
import { AiAssistant } from '@/modules/ai-assistant/pages/ai-assistant.page';
import { useCommandPalette } from '@/modules/command-palette/command-palette.provider';
import { useConfig } from '@/modules/config/config.provider';
import { DocumentUploadProvider } from '@/modules/documents/components/document-import-status.component';
import { useI18n } from '@/modules/i18n/i18n.provider';
import { OrganizationSwitcher } from '@/modules/organizations/components/organization-switcher.component';
import { fetchOrganization } from '@/modules/organizations/organizations.services';
import { toggleHiddenId } from '@/modules/preferences/preferences.models';
import { useMemberPreferences } from '@/modules/preferences/use-member-preferences';
import { queryClient } from '@/modules/shared/query/query-client';
import { cn } from '@/modules/shared/style/cn';
import { getErrorStatus } from '@/modules/shared/utils/errors';
import { UpgradeDialog } from '@/modules/subscriptions/components/upgrade-dialog.component';
import { fetchOrganizationSubscription } from '@/modules/subscriptions/subscriptions.services';
import { SideNav } from '@/modules/ui/components/sidenav';
import { buildOrganizationWorkspaceNavigation, getOrganizationRouteHref, getOrganizationRouteLabelKey } from '@/modules/ui/navigation/organization-navigation';
import { useTrackWorkspacePath } from '@/modules/ui/navigation/return-to';
import { useNavigationCapabilities } from '@/modules/ui/navigation/use-navigation-capabilities';
import { useOrganizationFooterMenu } from '@/modules/ui/navigation/use-organization-footer-menu';
import { UserSettingsDropdown } from '@/modules/users/components/user-settings.component';
import { useCurrentUser } from '@/modules/users/composables/useCurrentUser';
import { Button } from '../components/button';
import { MobileTabBar } from './mobile/mobile-tab-bar.component';
import { ShellBreadcrumb, SidenavLayout } from './sidenav.layout';

const UpgradeCTAFooter: Component<{ organizationId: string }> = (props) => {
  const { t } = useI18n();
  const { config } = useConfig();

  const query = useQuery(() => ({
    queryKey: ['organizations', props.organizationId, 'subscription'],
    queryFn: () => fetchOrganizationSubscription({ organizationId: props.organizationId }),
  }));

  const shouldShowUpgradeCTA = () => {
    if (!config.isSubscriptionsEnabled) {
      return false;
    }

    return query.data && query.data.plan.id === 'free';
  };

  return (
    <div>
      <Show when={shouldShowUpgradeCTA()}>

        <div class="rounded-lg border border-sidebar-border bg-background p-3">
          <div class="flex items-center gap-2 text-sm font-medium">
            <div class="i-tabler-sparkles size-4 text-muted-foreground" />
            {t('layout.upgrade-cta.title')}
          </div>
          <div class="text-xs mt-1 mb-3 text-muted-foreground">
            {t('layout.upgrade-cta.description')}
          </div>
          <UpgradeDialog organizationId={props.organizationId}>
            {dialogProps => (
              <Button size="sm" class="w-full font-semibold" {...dialogProps}>
                {t('layout.upgrade-cta.button')}
                <div class="i-tabler-arrow-right size-4 ml-1" />
              </Button>
            )}
          </UpgradeDialog>
        </div>
      </Show>
    </div>
  );
};

const OrganizationLayoutSideNav: Component = () => {
  const navigate = useNavigate();
  const params = useParams();
  const { t } = useI18n();
  const { openCommandPalette } = useCommandPalette();
  const { user } = useCurrentUser();

  const getCapabilities = useNavigationCapabilities();
  // A restaurant has no sales representatives: each member hides what their business does not use
  const { getPreferences, updatePreferences } = useMemberPreferences();
  const [isCustomizingMenu, setIsCustomizingMenu] = createSignal(false);

  // One memo for the whole menu: during the redirect from / the params briefly lose the organization, and evaluating
  // the sections on every read left the links stuck on /organizations/undefined/...
  const getMainMenuSections = createMemo(() => buildOrganizationWorkspaceNavigation({
    organizationId: params.organizationId,
    capabilities: getCapabilities(),
    translate: t,
    hiddenItemIds: getPreferences().navigation.hiddenItemIds,
    includeHidden: isCustomizingMenu(),
  }));

  const getMenuCustomization = (): SideNavCustomization => ({
    isEditing: isCustomizingMenu(),
    onToggleEditing: () => setIsCustomizingMenu(value => !value),
    onToggleItem: ({ id, isHidden }) => void updatePreferences({
      navigation: { hiddenItemIds: toggleHiddenId({ hiddenIds: getPreferences().navigation.hiddenItemIds, id, isHidden }) },
    }),
    labels: {
      customize: t('navigation.customize.button'),
      done: t('navigation.customize.done'),
      hide: label => t('navigation.customize.hide', { label }),
      show: label => t('navigation.customize.show', { label }),
    },
  });

  const getFooterMenuItems = useOrganizationFooterMenu();
  useTrackWorkspacePath();

  const organizationQuery = useQuery(() => ({
    queryKey: ['organizations', params.organizationId],
    queryFn: () => fetchOrganization({ organizationId: params.organizationId }),
  }));

  createEffect(on(
    () => organizationQuery.error,
    (error) => {
      if (error) {
        const status = getErrorStatus(error);

        if (status && [
          400, // when the id of the organization is not valid
          403, // when the user does not have access to the organization or the organization does not exist
        ].includes(status)) {
          navigate('/');
        }
      }
    },
  ));

  return (
    <SideNav
      mainSections={getMainMenuSections()}
      customization={getMenuCustomization()}
      footerMenu={getFooterMenuItems()}
      preFooter={() => <UpgradeCTAFooter organizationId={params.organizationId} />}
      footer={() => <UserSettingsDropdown userId={user.id} userName={user.name} userEmail={user.email} />}
      header={() =>
        (
          <div class="flex min-w-0 max-w-full flex-col gap-2">
            <OrganizationSwitcher class="w-full" />

            <button
              type="button"
              onClick={openCommandPalette}
              class="flex h-8 w-full items-center gap-2 rounded-md border border-sidebar-border bg-background px-2 text-sm text-muted-foreground shadow-xs transition-colors hover:text-foreground"
            >
              <div class="i-tabler-search size-4 shrink-0" />
              <span class="flex-1 truncate text-left">{t('layout.search.placeholder')}</span>
              <kbd class="inline-flex items-center gap-0.5 rounded border bg-card px-1.5 font-sans text-[11px] font-medium leading-5 shrink-0">
                <span>⌘</span>
                <span>K</span>
              </kbd>
            </button>
          </div>
        )}
    />

  );
};

// The Paqui button: opens the assistant next to the page (over it on a phone), or leaves its full page for that
const AssistantToggleButton: Component<{ class?: string }> = (props) => {
  const params = useParams();
  const location = useLocation();
  const navigate = useNavigate();
  const { t } = useI18n();
  const assistantPanel = useAiAssistantPanel();
  const assistantHref = () => getOrganizationRouteHref({ organizationId: params.organizationId, routeId: 'assistant' });
  const isAssistantPage = () => location.pathname === assistantHref();

  const handleAssistantClick = () => {
    if (isAssistantPage()) {
      navigate(getOrganizationRouteHref({ organizationId: params.organizationId, routeId: 'home' }));
      assistantPanel.open();
      return;
    }

    assistantPanel.toggle();
  };

  return (
    <Button
      variant={assistantPanel.isOpen() && !isAssistantPage() ? 'secondary' : 'ghost'}
      size="sm"
      class={cn('h-8 gap-1.5', props.class)}
      onClick={handleAssistantClick}
      aria-pressed={assistantPanel.isOpen() && !isAssistantPage()}
      aria-label={t('ai-assistant.subtitle')}
    >
      <img src="/logo.svg" alt="" class="size-5 [image-rendering:pixelated]" />
    </Button>
  );
};

const OrganizationWorkspaceHeader: Component<{ organizationName?: string }> = (props) => {
  const params = useParams();
  const location = useLocation();
  const { t } = useI18n();

  return (
    <div class="flex min-w-0 flex-1 items-center justify-between gap-3">
      <ShellBreadcrumb
        parent={props.organizationName}
        title={t(getOrganizationRouteLabelKey({ organizationId: params.organizationId, pathname: location.pathname }))}
      />

      <AssistantToggleButton class="-mr-2" />
    </div>
  );
};

// The phone has no side menu: the organization, the search, the assistant and the account sit in the header
const OrganizationMobileHeader: Component = () => {
  const { t } = useI18n();
  const { openCommandPalette } = useCommandPalette();
  const { user } = useCurrentUser();

  return (
    <div class="flex min-w-0 flex-1 items-center justify-between gap-1">
      <OrganizationSwitcher class="min-w-0" triggerClass="h-11 max-w-full gap-1 px-1.5 hover:bg-accent data-[expanded]:bg-accent" />

      <div class="flex shrink-0 items-center gap-0.5">
        <Button variant="ghost" size="icon" class="size-10 rounded-full text-muted-foreground" onClick={openCommandPalette} aria-label={t('layout.mobile.search')}>
          <div class="i-tabler-search size-5" />
        </Button>
        <AssistantToggleButton class="size-10 rounded-full p-0" />
        <UserSettingsDropdown compact userId={user.id} userName={user.name} userEmail={user.email} class="ml-0.5" />
      </div>
    </div>
  );
};

const OrganizationAiAssistantPanel: Component = () => {
  const params = useParams();
  const navigate = useNavigate();
  const assistantPanel = useAiAssistantPanel();

  return (
    <AiAssistant
      mode="panel"
      onClose={assistantPanel.close}
      onExpand={() => {
        assistantPanel.close();
        navigate(getOrganizationRouteHref({ organizationId: params.organizationId, routeId: 'assistant' }));
      }}
    />
  );
};

const OrganizationWorkspaceShell: ParentComponent<{ organizationName?: string }> = (props) => {
  const params = useParams();
  const location = useLocation();
  const assistantPanel = useAiAssistantPanel();

  const isAssistantPanelOpen = () => {
    const assistantHref = getOrganizationRouteHref({ organizationId: params.organizationId, routeId: 'assistant' });
    return assistantPanel.isOpen() && location.pathname !== assistantHref;
  };

  return (
    <SidenavLayout
      sideNav={OrganizationLayoutSideNav}
      header={() => <OrganizationWorkspaceHeader organizationName={props.organizationName} />}
      mobileHeader={OrganizationMobileHeader}
      mobileNav={MobileTabBar}
      rightPanel={OrganizationAiAssistantPanel}
      isRightPanelOpen={isAssistantPanelOpen}
    >
      {props.children}
    </SidenavLayout>
  );
};

export const OrganizationLayout: ParentComponent = (props) => {
  const params = useParams();
  const navigate = useNavigate();

  const query = useQuery(() => ({
    queryKey: ['organizations', params.organizationId],
    queryFn: () => fetchOrganization({ organizationId: params.organizationId }),
  }));

  createEffect(on(
    () => query.error,
    (error) => {
      if (error) {
        const status = getErrorStatus(error);

        if (status && [401, 403].includes(status)) {
          queryClient.invalidateQueries({ queryKey: ['organizations'] });
          navigate('/');
        }
      }
    },
  ));

  return (
    <DocumentUploadProvider organizationId={params.organizationId}>
      <AiAssistantPanelProvider>
        <OrganizationWorkspaceShell organizationName={query.data?.organization.name}>
          {props.children}
        </OrganizationWorkspaceShell>
      </AiAssistantPanelProvider>
    </DocumentUploadProvider>
  );
};
