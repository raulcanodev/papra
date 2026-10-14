import type { TranslationKeys } from '@/modules/i18n/locales.types';
import type { SideNavMenuSection } from '@/modules/ui/components/sidenav';

export type OrganizationNavigationCapability = 'invoicing' | 'personal-finances';

export type OrganizationNavigationCapabilities = Readonly<Record<OrganizationNavigationCapability, boolean>>;

type OrganizationRouteSurface = 'workspace' | 'settings';

type OrganizationRouteDefinition = {
  path: string;
  surface: OrganizationRouteSurface;
};

export const organizationRoutes = {
  home: { path: 'home', surface: 'workspace' },
  documents: { path: 'documents', surface: 'workspace' },
  assistant: { path: 'ai-assistant', surface: 'workspace' },
  calendar: { path: 'calendar', surface: 'workspace' },
  invoices: { path: 'invoicing/invoices', surface: 'workspace' },
  // Received invoices live under the invoices entry of the menu, as a tab
  purchases: { path: 'invoicing/invoices/received', surface: 'workspace' },
  contacts: { path: 'contacts', surface: 'workspace' },
  products: { path: 'invoicing/products', surface: 'workspace' },
  taxes: { path: 'taxes', surface: 'workspace' },
  financeOverview: { path: 'finances/overview', surface: 'workspace' },
  financeTransactions: { path: 'finances/transactions', surface: 'workspace' },
  financeSubscriptions: { path: 'finances/subscriptions', surface: 'workspace' },
  financeGoals: { path: 'finances/goals', surface: 'workspace' },
  deletedDocuments: { path: 'documents/deleted', surface: 'workspace' },

  settingsGeneral: { path: 'settings', surface: 'settings' },
  settingsMembers: { path: 'settings/members', surface: 'settings' },
  settingsModules: { path: 'settings/modules', surface: 'settings' },
  settingsTags: { path: 'settings/documents/tags', surface: 'settings' },
  settingsCustomProperties: { path: 'settings/documents/custom-properties', surface: 'settings' },
  settingsAutomations: { path: 'settings/documents/automations', surface: 'settings' },
  settingsIntakeEmails: { path: 'settings/documents/intake-emails', surface: 'settings' },
  settingsFiscalProfile: { path: 'settings/invoicing/fiscal-profile', surface: 'settings' },
  settingsInvoiceSeries: { path: 'settings/invoicing/series', surface: 'settings' },
  settingsTaxes: { path: 'settings/invoicing/taxes', surface: 'settings' },
  settingsVerifactu: { path: 'settings/invoicing/verifactu', surface: 'settings' },
  settingsInvoiceBranding: { path: 'settings/invoicing/branding', surface: 'settings' },
  settingsWebhooks: { path: 'settings/integrations/webhooks', surface: 'settings' },
  settingsUsage: { path: 'settings/account/usage', surface: 'settings' },
} as const satisfies Record<string, OrganizationRouteDefinition>;

export type OrganizationRouteId = keyof typeof organizationRoutes;

export const organizationRouteLabelKeys = {
  home: 'navigation.item.home',
  documents: 'navigation.item.documents',
  assistant: 'navigation.item.assistant',
  calendar: 'navigation.item.calendar',
  invoices: 'navigation.item.invoices',
  purchases: 'navigation.item.received-invoices',
  contacts: 'navigation.item.contacts',
  products: 'navigation.item.products',
  taxes: 'navigation.item.quarterly-taxes',
  financeOverview: 'navigation.item.overview',
  financeTransactions: 'navigation.item.transactions',
  financeSubscriptions: 'navigation.item.subscriptions',
  financeGoals: 'navigation.item.goals',
  deletedDocuments: 'layout.menu.deleted-documents',
  settingsGeneral: 'navigation.item.general',
  settingsMembers: 'navigation.item.members',
  settingsModules: 'navigation.item.modules',
  settingsTags: 'navigation.item.tags',
  settingsCustomProperties: 'navigation.item.custom-fields',
  settingsAutomations: 'navigation.item.automations',
  settingsIntakeEmails: 'navigation.item.intake-emails',
  settingsFiscalProfile: 'navigation.item.fiscal-profile',
  settingsInvoiceSeries: 'navigation.item.invoice-series',
  settingsTaxes: 'navigation.item.taxes',
  settingsVerifactu: 'navigation.item.verifactu',
  settingsInvoiceBranding: 'navigation.item.invoice-branding',
  settingsWebhooks: 'navigation.item.webhooks',
  settingsUsage: 'navigation.item.usage',
} as const satisfies Record<OrganizationRouteId, TranslationKeys>;

type NavigationItemDefinition = {
  routeId: OrganizationRouteId;
  icon: string;
  requires?: OrganizationNavigationCapability;
  /** Also highlighted on the sub routes (invoices for the received invoices and the editors) */
  matchSubRoutes?: boolean;
};

type NavigationSectionDefinition = {
  id: string;
  labelKey: TranslationKeys;
  items: readonly NavigationItemDefinition[];
  requires?: OrganizationNavigationCapability;
};

const workspaceNavigation: readonly NavigationSectionDefinition[] = [
  {
    id: 'workspace',
    labelKey: 'navigation.section.workspace',
    items: [
      { routeId: 'home', icon: 'i-tabler-home' },
      { routeId: 'documents', icon: 'i-tabler-file-text' },
      { routeId: 'calendar', icon: 'i-tabler-calendar-month' },
    ],
  },
  {
    id: 'invoicing',
    labelKey: 'navigation.section.invoicing',
    requires: 'invoicing',
    items: [
      { routeId: 'invoices', icon: 'i-tabler-receipt', matchSubRoutes: true },
      { routeId: 'contacts', icon: 'i-tabler-address-book' },
      { routeId: 'products', icon: 'i-tabler-package' },
      { routeId: 'taxes', icon: 'i-tabler-receipt-tax' },
    ],
  },
  {
    id: 'personal-finances',
    labelKey: 'navigation.section.personal-finances',
    requires: 'personal-finances',
    items: [
      { routeId: 'financeOverview', icon: 'i-tabler-chart-bar' },
      { routeId: 'financeTransactions', icon: 'i-tabler-arrows-exchange' },
      { routeId: 'financeSubscriptions', icon: 'i-tabler-repeat' },
      { routeId: 'financeGoals', icon: 'i-tabler-chart-pie' },
    ],
  },
];

const settingsNavigation: readonly NavigationSectionDefinition[] = [
  {
    id: 'organization',
    labelKey: 'navigation.section.organization',
    items: [
      { routeId: 'settingsGeneral', icon: 'i-tabler-settings' },
      { routeId: 'settingsMembers', icon: 'i-tabler-users' },
      { routeId: 'settingsModules', icon: 'i-tabler-layout-grid' },
    ],
  },
  {
    id: 'documents',
    labelKey: 'navigation.section.documents',
    items: [
      { routeId: 'settingsTags', icon: 'i-tabler-tags' },
      { routeId: 'settingsCustomProperties', icon: 'i-tabler-forms' },
      { routeId: 'settingsAutomations', icon: 'i-tabler-wand' },
      { routeId: 'settingsIntakeEmails', icon: 'i-tabler-mail' },
    ],
  },
  {
    id: 'invoicing',
    labelKey: 'navigation.section.invoicing',
    requires: 'invoicing',
    items: [
      { routeId: 'settingsFiscalProfile', icon: 'i-tabler-building-bank' },
      { routeId: 'settingsInvoiceSeries', icon: 'i-tabler-list-numbers' },
      { routeId: 'settingsTaxes', icon: 'i-tabler-percentage' },
      { routeId: 'settingsVerifactu', icon: 'i-tabler-shield-check' },
      { routeId: 'settingsInvoiceBranding', icon: 'i-tabler-brush' },
    ],
  },
  {
    id: 'integrations',
    labelKey: 'navigation.section.integrations',
    items: [
      { routeId: 'settingsWebhooks', icon: 'i-tabler-webhook' },
    ],
  },
  {
    id: 'account',
    labelKey: 'navigation.section.account',
    items: [
      { routeId: 'settingsUsage', icon: 'i-tabler-chart-bar' },
    ],
  },
];

export function getOrganizationRouteHref({ organizationId, routeId }: { organizationId: string; routeId: OrganizationRouteId }) {
  return `/organizations/${organizationId}/${organizationRoutes[routeId].path}`;
}

export function getOrganizationRouteChildHref({
  organizationId,
  routeId,
  childPath,
}: {
  organizationId: string;
  routeId: OrganizationRouteId;
  childPath: string;
}) {
  return `${getOrganizationRouteHref({ organizationId, routeId })}/${childPath.replace(/^\/+/, '')}`;
}

export function getOrganizationNestedRoutePath(routeId: OrganizationRouteId) {
  const route = organizationRoutes[routeId];

  if (route.surface === 'workspace') {
    return `/${route.path}`;
  }

  if (route.path === 'settings') {
    return '/';
  }

  return `/${route.path.replace(/^settings\//, '')}`;
}

function hasCapability(
  requiredCapability: OrganizationNavigationCapability | undefined,
  capabilities: OrganizationNavigationCapabilities,
) {
  return !requiredCapability || capabilities[requiredCapability];
}

function buildNavigationSections({
  definitions,
  organizationId,
  capabilities,
  translate,
}: {
  definitions: readonly NavigationSectionDefinition[];
  organizationId: string;
  capabilities: OrganizationNavigationCapabilities;
  translate: (key: TranslationKeys) => string;
}): SideNavMenuSection[] {
  return definitions
    .filter(section => hasCapability(section.requires, capabilities))
    .map(section => ({
      id: section.id,
      label: translate(section.labelKey),
      items: section.items
        .filter(item => hasCapability(item.requires, capabilities))
        .map(item => ({
          label: translate(organizationRouteLabelKeys[item.routeId]),
          icon: item.icon,
          href: getOrganizationRouteHref({ organizationId, routeId: item.routeId }),
          end: !item.matchSubRoutes,
        })),
    }))
    .filter(section => section.items.length > 0);
}

export function buildOrganizationWorkspaceNavigation(args: Omit<Parameters<typeof buildNavigationSections>[0], 'definitions'>) {
  return buildNavigationSections({ ...args, definitions: workspaceNavigation });
}

export function buildOrganizationSettingsNavigation(args: Omit<Parameters<typeof buildNavigationSections>[0], 'definitions'>) {
  return buildNavigationSections({ ...args, definitions: settingsNavigation });
}

export function getOrganizationRouteLabelKey({ organizationId, pathname }: { organizationId: string; pathname: string }) {
  const organizationPath = `/organizations/${organizationId}/`;
  const relativePath = pathname.startsWith(organizationPath) ? pathname.slice(organizationPath.length) : '';
  const routeId = (Object.keys(organizationRoutes) as OrganizationRouteId[])
    .filter(id => relativePath === organizationRoutes[id].path || relativePath.startsWith(`${organizationRoutes[id].path}/`))
    .sort((left, right) => organizationRoutes[right].path.length - organizationRoutes[left].path.length)[0] ?? 'home';

  return organizationRouteLabelKeys[routeId];
}
