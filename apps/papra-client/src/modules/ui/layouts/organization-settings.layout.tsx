import type { ParentComponent } from 'solid-js';
import { A, useLocation, useParams } from '@solidjs/router';
import { useFeatureFlags } from '@/modules/feature-flags/feature-flags.provider';
import { useI18n } from '@/modules/i18n/i18n.provider';
import { SideNav } from '@/modules/ui/components/sidenav';
import { buildOrganizationSettingsNavigation, getOrganizationRouteHref, getOrganizationRouteLabelKey } from '@/modules/ui/navigation/organization-navigation';
import { Button } from '../components/button';
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

  const sideNav = () => (
    <SideNav
      mainSections={getNavigationSections()}
      header={() => (
        <div class="flex h-12 items-center gap-1 px-1">
          <Button variant="ghost" size="icon-sm" class="text-muted-foreground" as={A} href={getOrganizationRouteHref({ organizationId: params.organizationId, routeId: 'home' })} aria-label={t('layout.back')}>
            <div class="i-tabler-arrow-left size-4" />
          </Button>
          <h1 class="text-sm font-semibold">
            {t('organization.settings.title')}
          </h1>
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
