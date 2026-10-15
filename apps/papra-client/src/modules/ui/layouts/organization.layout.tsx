import type { Component, ParentComponent } from 'solid-js';

import type { Organization } from '@/modules/organizations/organizations.types';

import type { SideNavCustomization } from '@/modules/ui/components/sidenav';
import { useLocation, useNavigate, useParams } from '@solidjs/router';
import { useQuery } from '@tanstack/solid-query';
import { createEffect, createSignal, on, Show } from 'solid-js';
import { AiAssistantPanelProvider, useAiAssistantPanel } from '@/modules/ai-assistant/ai-assistant-panel.provider';
import { AiAssistant } from '@/modules/ai-assistant/pages/ai-assistant.page';
import { useCommandPalette } from '@/modules/command-palette/command-palette.provider';
import { useConfig } from '@/modules/config/config.provider';
import { DocumentUploadProvider } from '@/modules/documents/components/document-import-status.component';
import { useI18n } from '@/modules/i18n/i18n.provider';
import { fetchOrganization, fetchOrganizations } from '@/modules/organizations/organizations.services';
import { toggleHiddenId } from '@/modules/preferences/preferences.models';
import { useMemberPreferences } from '@/modules/preferences/use-member-preferences';
import { queryClient } from '@/modules/shared/query/query-client';
import { getErrorStatus } from '@/modules/shared/utils/errors';
import { UpgradeDialog } from '@/modules/subscriptions/components/upgrade-dialog.component';
import { fetchOrganizationSubscription } from '@/modules/subscriptions/subscriptions.services';
import { SideNav } from '@/modules/ui/components/sidenav';
import { buildOrganizationWorkspaceNavigation, getOrganizationRouteHref, getOrganizationRouteLabelKey } from '@/modules/ui/navigation/organization-navigation';
import { useNavigationCapabilities } from '@/modules/ui/navigation/use-navigation-capabilities';
import { UserSettingsDropdown } from '@/modules/users/components/user-settings.component';
import { useCurrentUser } from '@/modules/users/composables/useCurrentUser';
import { Button } from '../components/button';
import { DiceBearAvatar } from '../components/dicebear-avatar';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '../components/select';
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
  const { user, hasPermission } = useCurrentUser();

  const getCapabilities = useNavigationCapabilities();
  // A restaurant has no sales representatives: each member hides what their business does not use
  const { getPreferences, updatePreferences } = useMemberPreferences();
  const [isCustomizingMenu, setIsCustomizingMenu] = createSignal(false);

  const getMainMenuSections = () => buildOrganizationWorkspaceNavigation({
    organizationId: params.organizationId,
    capabilities: getCapabilities(),
    translate: t,
    hiddenItemIds: getPreferences().navigation.hiddenItemIds,
    includeHidden: isCustomizingMenu(),
  });

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

  const getFooterMenuItems = () => [
    {
      label: t('layout.menu.organization-settings'),
      icon: 'i-tabler-settings',
      href: getOrganizationRouteHref({ organizationId: params.organizationId, routeId: 'settingsGeneral' }),
    },
    ...(hasPermission('bo:access')
      ? [{
          label: t('layout.menu.admin'),
          icon: 'i-tabler-shield-lock',
          href: '/admin',
        }]
      : []),
  ];

  const organizationsQuery = useQuery(() => ({
    queryKey: ['organizations'],
    queryFn: fetchOrganizations,
  }));

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
            <Select
              class="w-full"
              options={[...organizationsQuery.data?.organizations ?? [], { id: 'create' }]}
              optionValue="id"
              optionTextValue="name"
              value={organizationsQuery.data?.organizations.find(organization => organization.id === params.organizationId)}
              onChange={(value) => {
                if (!value || value.id === params.organizationId) {
                  return;
                }

                return value && (
                  value.id === 'create'
                    ? navigate('/organizations/create')
                    : navigate(`/organizations/${value.id}`));
              }}
              itemComponent={props => props.item.rawValue.id === 'create'
                ? (
                    <SelectItem class="cursor-pointer" item={props.item}>
                      <div class="flex items-center gap-2 text-muted-foreground">
                        <div class="i-tabler-plus size-4" />
                        <div>{t('layout.organization.create')}</div>
                      </div>
                    </SelectItem>
                  )
                : (
                    <SelectItem class="cursor-pointer" item={props.item}>
                      <div class="flex min-w-0 items-center gap-2">
                        <DiceBearAvatar
                          seed={props.item.rawValue.id}
                          type="organization"
                          alt=""
                          class="size-6 rounded-sm border"
                        />
                        <span class="truncate">{props.item.rawValue.name}</span>
                      </div>
                    </SelectItem>
                  )}
            >
              <SelectTrigger
                class="h-12 rounded-md border-0 bg-transparent px-2 shadow-none transition-colors hover:bg-sidebar-accent focus:ring-0 data-[expanded]:bg-sidebar-accent"
                caretIcon={<div class="i-tabler-selector size-4 shrink-0 text-muted-foreground" />}
              >
                <SelectValue<Organization | undefined> class="flex min-w-0 items-center gap-2">
                  {state => (
                    <>
                      <DiceBearAvatar
                        seed={state.selectedOption()?.id ?? 'organization'}
                        type="organization"
                        alt=""
                        class="size-8 rounded-md border"
                      />

                      <span class="truncate text-sm font-semibold">
                        {state.selectedOption()?.name}
                      </span>
                    </>
                  )}
                </SelectValue>
              </SelectTrigger>

              <SelectContent />
            </Select>

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

const OrganizationWorkspaceHeader: Component<{ organizationName?: string }> = (props) => {
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
    <div class="flex min-w-0 flex-1 items-center justify-between gap-3">
      <ShellBreadcrumb
        parent={props.organizationName}
        title={t(getOrganizationRouteLabelKey({ organizationId: params.organizationId, pathname: location.pathname }))}
      />

      <Button
        variant={assistantPanel.isOpen() && !isAssistantPage() ? 'secondary' : 'ghost'}
        size="sm"
        class="h-8 gap-1.5 -mr-2"
        onClick={handleAssistantClick}
        aria-pressed={assistantPanel.isOpen() && !isAssistantPage()}
        aria-label={t('ai-assistant.subtitle')}
      >
        <img src="/logo.svg" alt="" class="size-5 [image-rendering:pixelated]" />
      </Button>
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
