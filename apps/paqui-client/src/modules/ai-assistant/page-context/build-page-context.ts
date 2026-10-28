import type { AssistantScreen } from '../ai-assistant-panel.provider';
import type { PageSnapshot } from './capture-page-snapshot';
import type { SideNavMenuSection } from '@/modules/ui/components/sidenav';
import { organizationEntityRoutes } from '@/modules/ui/navigation/organization-navigation';
import { matchPathTemplate } from './match-path-template';

export type PageContext = {
  path: string;
  search?: string;
  title?: string;
  params: Record<string, string>;
  snapshot?: PageSnapshot;
  pages: Array<{ path: string; label: string; section?: string }>;
  entityPages: Array<{ path: string; label: string }>;
  screen?: AssistantScreen;
};

// What the assistant is told about where the user is. Pages come from the same navigation the menu is built from
// (so a module the organization does not have never shows up), the ids of the record on screen from matching the
// URL against the entity routes.
export function buildPageContext({ organizationId, pathname, search, title, snapshot, menuSections, screen }: {
  organizationId: string;
  pathname: string;
  search?: string;
  title?: string;
  snapshot?: PageSnapshot;
  menuSections: SideNavMenuSection[];
  screen?: AssistantScreen;
}): PageContext {
  const organizationPrefix = `/organizations/${organizationId}/`;
  const relativePath = pathname.startsWith(organizationPrefix) ? pathname.slice(organizationPrefix.length) : '';

  const params = Object.values(organizationEntityRoutes)
    .map(route => matchPathTemplate({ template: route.path, path: relativePath }))
    .find(match => match !== undefined) ?? {};

  return {
    path: pathname,
    search: search === '' ? undefined : search,
    title,
    params,
    snapshot,
    // Entries without a destination (they run an action) are not pages
    pages: menuSections.flatMap(section => section.items.flatMap(item => item.href === undefined ? [] : [{ path: item.href, label: item.label, section: section.label }])),
    entityPages: Object.values(organizationEntityRoutes).map(route => ({ path: `${organizationPrefix}${route.path}`, label: route.label })),
    screen,
  };
}
