import type { SideNavMenuItem } from '@/modules/ui/components/sidenav';
import { useParams } from '@solidjs/router';
import { useQuery } from '@tanstack/solid-query';
import { getGestoriaHomeHref } from '@/modules/gestorias/gestorias.navigation';
import { fetchUserGestorias } from '@/modules/gestorias/gestorias.services';
import { useI18n } from '@/modules/i18n/i18n.provider';
import { useCurrentUser } from '@/modules/users/composables/useCurrentUser';
import { getOrganizationRouteHref } from './organization-navigation';

// The links under the menu of an organization: the gestoría views of the member, the settings and the back office.
// The side menu of the computer and the "More" page of the phone list the same ones.
export function useOrganizationFooterMenu() {
  const params = useParams();
  const { t } = useI18n();
  const { hasPermission } = useCurrentUser();

  // People who also work at a gestoría switch to its workspace from here
  const gestoriasQuery = useQuery(() => ({ queryKey: ['gestorias'], queryFn: fetchUserGestorias }));

  return (): SideNavMenuItem[] => [
    ...(gestoriasQuery.data?.gestorias ?? []).map((gestoria, _, gestorias) => ({
      label: gestorias.length > 1 ? gestoria.name : t('layout.menu.gestoria-view'),
      icon: 'i-tabler-briefcase',
      href: getGestoriaHomeHref({ gestoriaId: gestoria.id }),
    })),
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
}
