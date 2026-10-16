import type { Component, ParentComponent } from 'solid-js';
import type { GestoriaSummary } from '../gestorias.types';
import type { SideNavMenuSection } from '@/modules/ui/components/sidenav';
import { makePersisted } from '@solid-primitives/storage';
import { useLocation, useNavigate, useParams } from '@solidjs/router';
import { useQuery } from '@tanstack/solid-query';
import { createEffect, createMemo, createSignal, on, Show } from 'solid-js';
import { useI18n } from '@/modules/i18n/i18n.provider';
import { fetchOrganizations } from '@/modules/organizations/organizations.services';
import { queryClient } from '@/modules/shared/query/query-client';
import { getErrorStatus } from '@/modules/shared/utils/errors';
import { DiceBearAvatar } from '@/modules/ui/components/dicebear-avatar';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/modules/ui/components/select';
import { SideNav } from '@/modules/ui/components/sidenav';
import { AppShell, ShellBreadcrumb } from '@/modules/ui/layouts/sidenav.layout';
import { UserSettingsDropdown } from '@/modules/users/components/user-settings.component';
import { useCurrentUser } from '@/modules/users/composables/useCurrentUser';
import { ClientSwitcher } from '../components/client-switcher.component';
import { GestoriaContext, useGestoria } from '../gestoria.context';
import { GESTORIA_MODULE_DEFINITIONS } from '../gestorias.constants';
import { getClientModules, getGestoriaClientModuleHref, getGestoriaHomeHref, getModuleFromPathname } from '../gestorias.navigation';
import { fetchGestoria, fetchUserGestorias, getGestoriaQueryKey } from '../gestorias.services';

const GestoriaSideNav: Component = () => {
  const params = useParams();
  const navigate = useNavigate();
  const { t } = useI18n();
  const { user, hasPermission } = useCurrentUser();
  const { getGestoria, getClients, getClient } = useGestoria();

  const gestoriasQuery = useQuery(() => ({ queryKey: ['gestorias'], queryFn: fetchUserGestorias }));
  // People working at a gestoría may also run a company of their own
  const organizationsQuery = useQuery(() => ({ queryKey: ['organizations'], queryFn: fetchOrganizations }));

  const getCurrentClient = () => getClient(params.organizationId);

  // One memo for the whole menu, like the organization one: the params briefly change during navigations
  const getMainSections = createMemo((): SideNavMenuSection[] => {
    const client = getCurrentClient();

    return [
      {
        id: 'gestoria',
        label: t('gestorias.navigation.section.gestoria'),
        items: [
          { id: 'home', label: t('gestorias.navigation.home'), icon: 'i-tabler-home', href: getGestoriaHomeHref({ gestoriaId: params.gestoriaId }) },
        ],
      },
      ...(client
        ? [{
            id: 'client',
            label: t('gestorias.navigation.section.client'),
            items: getClientModules({ client }).map(module => ({
              id: module,
              label: t(GESTORIA_MODULE_DEFINITIONS[module].labelKey),
              icon: GESTORIA_MODULE_DEFINITIONS[module].icon,
              href: getGestoriaClientModuleHref({ gestoriaId: params.gestoriaId, organizationId: client.organizationId, module }),
            })),
          }]
        : []),
    ];
  });

  const getFooterMenuItems = () => [
    ...((organizationsQuery.data?.organizations.length ?? 0) > 0
      ? [{ label: t('gestorias.navigation.my-companies'), icon: 'i-tabler-building', href: '/organizations' }]
      : []),
    ...(hasPermission('bo:access')
      ? [{ label: t('layout.menu.admin'), icon: 'i-tabler-shield-lock', href: '/admin' }]
      : []),
  ];

  return (
    <SideNav
      mainSections={getMainSections()}
      footerMenu={getFooterMenuItems()}
      footer={() => <UserSettingsDropdown userId={user.id} userName={user.name} userEmail={user.email} />}
      header={() => (
        <div class="flex min-w-0 max-w-full flex-col gap-2">
          <Select<GestoriaSummary>
            class="w-full"
            options={gestoriasQuery.data?.gestorias ?? (getGestoria() ? [getGestoria()!] : [])}
            optionValue="id"
            optionTextValue="name"
            value={gestoriasQuery.data?.gestorias.find(gestoria => gestoria.id === params.gestoriaId) ?? getGestoria()}
            onChange={(value) => {
              if (value && value.id !== params.gestoriaId) {
                navigate(getGestoriaHomeHref({ gestoriaId: value.id }));
              }
            }}
            itemComponent={props => (
              <SelectItem class="cursor-pointer" item={props.item}>
                <div class="flex min-w-0 items-center gap-2">
                  <DiceBearAvatar seed={props.item.rawValue.id} type="organization" alt="" class="size-6 rounded-sm border" />
                  <span class="truncate">{props.item.rawValue.name}</span>
                </div>
              </SelectItem>
            )}
          >
            <SelectTrigger
              class="h-12 rounded-md border-0 bg-transparent px-2 shadow-none transition-colors hover:bg-sidebar-accent focus:ring-0 data-[expanded]:bg-sidebar-accent"
              caretIcon={<div class="i-tabler-selector size-4 shrink-0 text-muted-foreground" />}
            >
              <SelectValue<GestoriaSummary | undefined> class="flex min-w-0 items-center gap-2">
                {state => (
                  <>
                    <DiceBearAvatar seed={state.selectedOption()?.id ?? 'gestoria'} type="organization" alt="" class="size-8 rounded-md border" />
                    <span class="min-w-0 text-left">
                      <span class="block truncate text-sm font-semibold leading-tight">{state.selectedOption()?.name}</span>
                      <span class="block truncate text-xs text-muted-foreground leading-tight">{t('gestorias.navigation.badge')}</span>
                    </span>
                  </>
                )}
              </SelectValue>
            </SelectTrigger>
            <SelectContent />
          </Select>

          <Show when={getClients().length > 0}>
            <ClientSwitcher gestoriaId={params.gestoriaId} clients={getClients()} currentClient={getCurrentClient()} />
          </Show>
        </div>
      )}
    />
  );
};

const GestoriaHeader: Component = () => {
  const params = useParams();
  const location = useLocation();
  const { t } = useI18n();
  const { getGestoria, getClient } = useGestoria();

  const getTitle = () => {
    const module = getModuleFromPathname({ pathname: location.pathname });

    return module ? t(GESTORIA_MODULE_DEFINITIONS[module].labelKey) : t('gestorias.navigation.home');
  };

  return <ShellBreadcrumb parent={getClient(params.organizationId)?.name ?? getGestoria()?.name} title={getTitle()} />;
};

export const GestoriaLayout: ParentComponent = (props) => {
  const params = useParams();
  const navigate = useNavigate();
  const [isSidebarOpen, setIsSidebarOpen] = makePersisted(createSignal(true), {
    name: 'paqui:workspace-sidebar-open',
    storage: localStorage,
  });

  const query = useQuery(() => ({
    queryKey: getGestoriaQueryKey({ gestoriaId: params.gestoriaId }),
    queryFn: () => fetchGestoria({ gestoriaId: params.gestoriaId }),
  }));

  // Not a member (anymore): back to the entry of the app, which finds where the user belongs
  createEffect(on(
    () => query.error,
    (error) => {
      const status = error ? getErrorStatus(error) : undefined;

      if (status && [400, 401, 403, 404].includes(status)) {
        void queryClient.invalidateQueries({ queryKey: ['gestorias'] });
        navigate('/');
      }
    },
  ));

  return (
    <GestoriaContext.Provider value={{
      getGestoria: () => query.data?.gestoria,
      getClients: () => query.data?.clients ?? [],
      getClient: organizationId => query.data?.clients.find(client => client.organizationId === organizationId),
      isLoading: () => query.isLoading,
    }}
    >
      <AppShell
        sideNav={GestoriaSideNav}
        header={GestoriaHeader}
        isSidebarOpen={isSidebarOpen}
        onToggleSidebar={() => setIsSidebarOpen(value => !value)}
      >
        {props.children}
      </AppShell>
    </GestoriaContext.Provider>
  );
};
