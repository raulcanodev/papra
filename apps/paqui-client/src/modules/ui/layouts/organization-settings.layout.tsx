import type { ParentComponent } from 'solid-js';
import { A, useLocation, useParams } from '@solidjs/router';
import { useQuery } from '@tanstack/solid-query';
import { useFeatureFlags } from '@/modules/feature-flags/feature-flags.provider';
import { useI18n } from '@/modules/i18n/i18n.provider';
import { fetchOrganization } from '@/modules/organizations/organizations.services';
import { SideNav } from '@/modules/ui/components/sidenav';
import { buildOrganizationSettingsNavigation, getOrganizationRouteHref, getOrganizationRouteLabelKey } from '@/modules/ui/navigation/organization-navigation';
import { AppShell, ShellBreadcrumb } from './sidenav.layout';

export const OrganizationSettingsLayout: ParentComponent = (props) => {
  const params = useParams();
  const location = useLocation();
  const { t } = useI18n();
  const { hasFlag } = useFeatureFlags();

  const getNavigationSections = () => buildOrganizationSettingsNavigation({
    organizationId: params.organizationId,
    capabilities: {
      'invoicing': true,
      'personal-finances': hasFlag('llc_finances'),
    },
    translate: t,
  });

  const organizationQuery = useQuery(() => ({
    queryKey: ['organizations', params.organizationId],
    queryFn: () => fetchOrganization({ organizationId: params.organizationId }),
  }));

  const sideNav = () => (
    <SideNav
      mainSections={getNavigationSections()}
      header={() => (
        <div class="flex min-h-12 items-center px-1 py-1.5">
          <A
            href={getOrganizationRouteHref({ organizationId: params.organizationId, routeId: 'home' })}
            aria-label={t('layout.back')}
            class="flex w-full min-w-0 items-center gap-2 rounded-md px-2 py-1.5 text-left transition-colors hover:bg-accent/50"
          >
            <div class="i-tabler-arrow-left size-4 shrink-0 text-muted-foreground" />
            <div class="min-w-0 flex-1">
              <div class="text-xs leading-tight text-muted-foreground">
                {t('organization.settings.short-title')}
              </div>
              <h1 class="line-clamp-2 break-words text-sm font-semibold leading-tight">
                {organizationQuery.data?.organization.name ?? t('organization.settings.title')}
              </h1>
            </div>
          </A>
        </div>
      )}
    />
  );

  return (
    <AppShell
      sideNav={sideNav}
      header={() => (
        <ShellBreadcrumb
          parent={t('organization.settings.title')}
          title={t(getOrganizationRouteLabelKey({ organizationId: params.organizationId, pathname: location.pathname }))}
        />
      )}
    >
      {props.children}
    </AppShell>
  );
};
