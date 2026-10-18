import type { OrganizationNavigationCapabilities, OrganizationRouteId } from './organization-navigation';
import type { SideNavMenuSection } from '@/modules/ui/components/sidenav';
import { buildOrganizationWorkspaceNavigation, organizationRoutes } from './organization-navigation';

// Phones get a bottom bar instead of the side menu: four destinations around the "+" button, the rest under "More"

export type MobileTab = {
  routeId: OrganizationRouteId;
  icon: string;
};

const mobileTabIcons = {
  home: 'i-tabler-home',
  documents: 'i-tabler-file-text',
  purchases: 'i-tabler-file-arrow-left',
  invoices: 'i-tabler-receipt',
  calendar: 'i-tabler-calendar-month',
  more: 'i-tabler-layout-grid',
} as const satisfies Partial<Record<OrganizationRouteId, string>>;

type MobileTabRouteId = keyof typeof mobileTabIcons;

/** The tabs left and right of the "+" button, in order: two before it, two after it */
export function getMobileTabs({ capabilities }: { capabilities: OrganizationNavigationCapabilities }): MobileTab[] {
  // Sales and purchases are the two daily invoicing destinations. Without invoicing, documents and the calendar
  // keep the bar useful without leaving holes.
  const routeIds: MobileTabRouteId[] = capabilities.invoicing
    ? ['home', 'purchases', 'invoices', 'more']
    : ['home', 'documents', 'calendar', 'more'];

  return routeIds.map(routeId => ({ routeId, icon: mobileTabIcons[routeId] }));
}

/** The tab to highlight: its own pages and their sub pages, and "More" for every page that has no tab */
export function getActiveMobileTab({ organizationId, pathname, tabs }: { organizationId: string; pathname: string; tabs: MobileTab[] }): OrganizationRouteId {
  const organizationPath = `/organizations/${organizationId}/`;
  const relativePath = pathname.startsWith(organizationPath) ? pathname.slice(organizationPath.length).replace(/\/$/, '') : '';

  const matchingTab = tabs.find(({ routeId }) => {
    const { path } = organizationRoutes[routeId];

    // Home only on itself: every page of the organization is "under" it otherwise
    return routeId === 'home'
      ? relativePath === path || relativePath === ''
      : relativePath === path || relativePath.startsWith(`${path}/`);
  });

  return matchingTab?.routeId ?? 'more';
}

/** The menu of the "More" page: the side menu of the computer without what the bottom bar already shows */
export function buildMobileMoreSections({
  tabs,
  ...args
}: Parameters<typeof buildOrganizationWorkspaceNavigation>[0] & { tabs: MobileTab[] }): SideNavMenuSection[] {
  const tabRouteIds = new Set<string>(tabs.map(({ routeId }) => routeId));

  return buildOrganizationWorkspaceNavigation(args)
    .map(section => ({ ...section, items: section.items.filter(item => !item.id || !tabRouteIds.has(item.id)) }))
    .filter(section => section.items.length > 0);
}
