import type { RouteDefinition } from '@solidjs/router';
import type { OrganizationRouteId } from './modules/ui/navigation/organization-navigation';
import type { OrganizationPlaceholderPageId } from './modules/ui/pages/organization-placeholder.page';
import { Navigate, useLocation, useParams, useSearchParams } from '@solidjs/router';
import { useQuery } from '@tanstack/solid-query';
import { Match, Show, Suspense, Switch } from 'solid-js';
import { adminRoutes } from './modules/admin/admin.routes';
import { AiAssistantPage } from './modules/ai-assistant/pages/ai-assistant.page';
import { ApiKeysPage } from './modules/api-keys/pages/api-keys.page';
import { CreateApiKeyPage } from './modules/api-keys/pages/create-api-key.page';
import { authPagesPaths } from './modules/auth/auth.constants';
import { AppEntryGate } from './modules/auth/components/app-entry-gate.component';
import { PublicOnlyPage } from './modules/auth/middleware/protected-page.middleware';
import { EmailValidationRequiredPage } from './modules/auth/pages/email-validation-required.page';
import { EmailVerificationPage } from './modules/auth/pages/email-verification.page';
import { LoginPage } from './modules/auth/pages/login.page';
import { RegisterPage } from './modules/auth/pages/register.page';
import { RequestPasswordResetPage } from './modules/auth/pages/request-password-reset.page';
import { ResetPasswordPage } from './modules/auth/pages/reset-password.page';
import { CalendarPage } from './modules/calendar/pages/calendar.page';
import { CapturePage } from './modules/captures/pages/capture.page';
import { isDemoMode } from './modules/config/config';
import { CONTACT_ROLE_ROUTE_IDS, CONTACT_ROLES } from './modules/contacts/contacts.constants';
import { ContactPage } from './modules/contacts/pages/contact.page';
import { ContactsPage } from './modules/contacts/pages/contacts.page';
import { CreateCustomPropertyPage } from './modules/custom-properties/pages/create-custom-property.page';
import { CustomPropertiesPage } from './modules/custom-properties/pages/custom-properties-list.page';
import { UpdateCustomPropertyPage } from './modules/custom-properties/pages/update-custom-property.page';
import { HomePage } from './modules/dashboard/pages/home.page';
import { DeliveryNoteEditorPage } from './modules/delivery-notes/pages/delivery-note-editor.page';
import { DeliveryNotesPage } from './modules/delivery-notes/pages/delivery-notes.page';
import { DeletedDocumentsPage } from './modules/documents/pages/deleted-documents.page';
import { DocumentPdfViewerPage } from './modules/documents/pages/document-pdf-viewer.page';
import { DocumentPage } from './modules/documents/pages/document.page';
import { DocumentsPage } from './modules/documents/pages/documents.page';
import { DueDatesPage } from './modules/due-dates/pages/due-dates.page';
import { FeatureFlagsProvider } from './modules/feature-flags/feature-flags.provider';
import { FinanceGoalsPage } from './modules/finances/pages/goals.page';
import { OverviewPage } from './modules/finances/pages/overview.page';
import { SubscriptionsPage } from './modules/finances/pages/subscriptions.page';
import { TransactionsPage } from './modules/finances/pages/transactions.page';
import { gestoriaRoutes } from './modules/gestorias/gestorias.routes';
import { fetchUserGestorias } from './modules/gestorias/gestorias.services';
import { IntakeEmailsPage } from './modules/intake-emails/pages/intake-emails.page';
import { InvitationsPage } from './modules/invitations/pages/invitations.page';
import { CreateInvoicePage } from './modules/invoicing/pages/create-invoice.page';
import { FiscalProfilePage } from './modules/invoicing/pages/fiscal-profile.page';
import { InvoiceBrandingPage } from './modules/invoicing/pages/invoice-branding.page';
import { InvoiceSeriesPage } from './modules/invoicing/pages/invoice-series.page';
import { InvoicesPage } from './modules/invoicing/pages/invoices.page';
import { ProductsPage } from './modules/invoicing/pages/products.page';
import { TaxesPage } from './modules/invoicing/pages/taxes.page';
import { VerifactuPage } from './modules/invoicing/pages/verifactu.page';
import { OnboardingGate } from './modules/onboarding/components/onboarding-gate.component';
import { OnboardingPage, OrganizationSetupPage } from './modules/onboarding/pages/onboarding.page';
import { useLastOrganization } from './modules/organizations/composables/use-last-organization';
import { fetchOrganizations } from './modules/organizations/organizations.services';
import { DeletedOrganizationsPage } from './modules/organizations/pages/deleted-organizations.page';
import { InvitationsListPage } from './modules/organizations/pages/invitations-list.page';
import { InviteMemberPage } from './modules/organizations/pages/invite-member.page';
import { MembersPage } from './modules/organizations/pages/members.page';
import { OrganizationMorePage } from './modules/organizations/pages/organization-more.page';
import { OrganizationUsagePage } from './modules/organizations/pages/organization-usage.page';
import { OrganizationsSettingsPage } from './modules/organizations/pages/organizations-settings.page';
import { OrganizationsPage } from './modules/organizations/pages/organizations.page';
import { PriceListPage } from './modules/pricing/pages/price-list.page';
import { PriceListsPage } from './modules/pricing/pages/price-lists.page';
import { PurchaseEditorPage } from './modules/purchases/pages/purchase-editor.page';
import { PurchasesPage } from './modules/purchases/pages/purchases.page';
import { InstallAppPage } from './modules/pwa/pages/install-app.page';
import { LandingPage } from './modules/shared/pages/landing.page';
import { NotFoundPage } from './modules/shared/pages/not-found.page';
import { CheckoutCancelPage } from './modules/subscriptions/pages/checkout-cancel.page';
import { CheckoutSuccessPage } from './modules/subscriptions/pages/checkout-success.page';
import { CreateTaggingRulePage } from './modules/tagging-rules/pages/create-tagging-rule.page';
import { TaggingRulesPage } from './modules/tagging-rules/pages/tagging-rules.page';
import { UpdateTaggingRulePage } from './modules/tagging-rules/pages/update-tagging-rule.page';
import { TagsPage } from './modules/tags/pages/tags.page';
import { QuarterlyTaxesPage } from './modules/taxes/pages/quarterly-taxes.page';
import { OrganizationSettingsLayout } from './modules/ui/layouts/organization-settings.layout';
import { OrganizationLayout } from './modules/ui/layouts/organization.layout';
import { SettingsLayout } from './modules/ui/layouts/settings.layout';
import { getOrganizationEntityRoutePath, getOrganizationNestedRoutePath, getOrganizationRouteChildHref, getOrganizationRouteHref } from './modules/ui/navigation/organization-navigation';
import { OrganizationPlaceholderPage } from './modules/ui/pages/organization-placeholder.page';
import { UserSettingsPage } from './modules/users/pages/user-settings.page';
import { CreateWebhookPage } from './modules/webhooks/pages/create-webhook.page';
import { EditWebhookPage } from './modules/webhooks/pages/edit-webhook.page';
import { WebhooksPage } from './modules/webhooks/pages/webhooks.page';

const ORGANIZATION_ID_PATTERN = /^org_[a-zA-Z0-9]+$/;

function OrganizationRouteRedirect(props: { routeId: OrganizationRouteId; childPath?: string; search?: string }) {
  const params = useParams();
  const href = () => `${props.childPath
    ? getOrganizationRouteChildHref({ organizationId: params.organizationId, routeId: props.routeId, childPath: props.childPath })
    : getOrganizationRouteHref({ organizationId: params.organizationId, routeId: props.routeId })}${props.search ?? ''}`;

  return <Navigate href={href()} />;
}

// Keeps the old /contacts?role= links working, each role has its own page now

function ContactsRedirect() {
  const [searchParams] = useSearchParams();
  const role = () => CONTACT_ROLES.find(contactRole => contactRole === searchParams.role) ?? 'customer';

  return <OrganizationRouteRedirect routeId={CONTACT_ROLE_ROUTE_IDS[role()]} />;
}

// Keeps the old invoicing/invoices links working: issued invoices are under sales now, received ones under purchases
function LegacyInvoicesRedirect() {
  const params = useParams();
  const location = useLocation();
  const rest = () => (params.rest ?? '').replace(/^\/+/, '');
  const isReceived = () => rest() === 'received' || rest().startsWith('received/');
  const childPath = () => (isReceived() ? rest().slice('received'.length).replace(/^\/+/, '') : rest());

  return <OrganizationRouteRedirect routeId={isReceived() ? 'purchases' : 'invoices'} childPath={childPath() || undefined} search={location.search} />;
}

function OrganizationPlaceholder(props: { pageId: OrganizationPlaceholderPageId }) {
  return <OrganizationPlaceholderPage pageId={props.pageId} />;
}

export const routes: RouteDefinition[] = [
  {
    path: '/',
    component: AppEntryGate,
    children: [
      {
        path: '/',
        component: props => (
          <FeatureFlagsProvider>
            <OnboardingGate>{props.children}</OnboardingGate>
          </FeatureFlagsProvider>
        ),
        children: [
          {
            path: '/',
            component: () => {
              const { getLatestOrganizationId } = useLastOrganization();

              const query = useQuery(() => ({
                queryKey: ['organizations'],
                queryFn: fetchOrganizations,
              }));

              // People working at a gestoría land on it, unless they were last in a company of their own
              const gestoriasQuery = useQuery(() => ({
                queryKey: ['gestorias'],
                queryFn: fetchUserGestorias,
              }));
              // Never blocks the entry: on an error the user is not a gestor
              const isGestoriasQuerySettled = () => gestoriasQuery.isSuccess || gestoriasQuery.isError;
              // The demo visitor starts as the company, the gestoría view is one click away in the menu
              const getFirstGestoriaId = () => (isDemoMode ? undefined : gestoriasQuery.data?.gestorias?.at(0)?.id);

              return (
                <>
                  <Suspense>
                    <Show when={isGestoriasQuerySettled() && query.data?.organizations}>
                      {getOrgs => (
                        <Switch>
                          <Match when={getLatestOrganizationId() && getOrgs().some(org => org.id === getLatestOrganizationId())}>
                            <Navigate href={`/organizations/${getLatestOrganizationId()}`} />
                          </Match>

                          <Match when={getFirstGestoriaId()}>
                            {getGestoriaId => <Navigate href={`/gestoria/${getGestoriaId()}/home`} />}
                          </Match>

                          <Match when={getOrgs().length === 1}>
                            <Navigate href={`/organizations/${getOrgs()[0]?.id ?? ''}`} />
                          </Match>

                          <Match when={getOrgs().length > 0}>
                            <Navigate href="/organizations" />
                          </Match>

                          <Match when={getOrgs().length === 0}>
                            <Navigate href="/organizations/create" />
                          </Match>
                        </Switch>
                      )}
                    </Show>
                  </Suspense>
                </>

              );
            },
          },
          {
            path: '/onboarding',
            component: OnboardingPage,
          },
          {
            path: '/organizations',
            children: [
              {
                path: '/',
                component: OrganizationsPage,
              },
              {
                path: '/deleted',
                component: DeletedOrganizationsPage,
              },
              {
                path: '/:organizationId',
                matchFilters: {
                  organizationId: ORGANIZATION_ID_PATTERN,
                },
                component: (props) => {
                  const params = useParams();
                  const { setLatestOrganizationId } = useLastOrganization();

                  setLatestOrganizationId(params.organizationId);

                  return <>{props.children}</>;
                },
                children: [
                  {
                    // Routes with the organization layout
                    path: '/',
                    component: OrganizationLayout,
                    children: [
                      {
                        path: '/',
                        component: () => <OrganizationRouteRedirect routeId="home" />,
                      },
                      {
                        path: getOrganizationNestedRoutePath('home'),
                        component: HomePage,
                      },
                      {
                        path: getOrganizationNestedRoutePath('documents'),
                        component: DocumentsPage,
                      },
                      {
                        path: getOrganizationEntityRoutePath('document'),
                        component: DocumentPage,
                      },
                      {
                        // The trash moved to the settings, old links still land on it
                        path: '/documents/deleted',
                        component: () => <OrganizationRouteRedirect routeId="deletedDocuments" />,
                      },
                      {
                        path: getOrganizationNestedRoutePath('invoices'),
                        component: InvoicesPage,
                      },
                      {
                        path: getOrganizationNestedRoutePath('calendar'),
                        component: CalendarPage,
                      },
                      {
                        path: [getOrganizationEntityRoutePath('newInvoice'), getOrganizationEntityRoutePath('editInvoice')],
                        component: CreateInvoicePage,
                      },
                      {
                        path: getOrganizationNestedRoutePath('taxes'),
                        component: QuarterlyTaxesPage,
                      },
                      {
                        path: getOrganizationNestedRoutePath('purchases'),
                        component: PurchasesPage,
                      },
                      {
                        path: getOrganizationNestedRoutePath('deliveryNotes'),
                        component: DeliveryNotesPage,
                      },
                      {
                        path: [getOrganizationEntityRoutePath('newDeliveryNote'), getOrganizationEntityRoutePath('editDeliveryNote')],
                        component: DeliveryNoteEditorPage,
                      },
                      {
                        path: getOrganizationNestedRoutePath('dueDates'),
                        component: DueDatesPage,
                      },
                      {
                        path: [getOrganizationEntityRoutePath('newPurchaseInvoice'), getOrganizationEntityRoutePath('editPurchaseInvoice')],
                        component: PurchaseEditorPage,
                      },
                      {
                        path: getOrganizationNestedRoutePath('customers'),
                        component: () => <ContactsPage role="customer" />,
                      },
                      {
                        path: getOrganizationNestedRoutePath('suppliers'),
                        component: () => <ContactsPage role="supplier" />,
                      },
                      {
                        path: getOrganizationNestedRoutePath('salesRepresentatives'),
                        component: () => <ContactsPage role="sales_representative" />,
                      },
                      {
                        path: getOrganizationEntityRoutePath('contact'),
                        component: ContactPage,
                      },
                      {
                        // Former single contacts page with a role filter, and former customers and sales representatives pages
                        path: '/contacts',
                        component: ContactsRedirect,
                      },
                      {
                        path: '/invoicing/customers',
                        component: () => <OrganizationRouteRedirect routeId="customers" />,
                      },
                      {
                        path: '/invoicing/sales-representatives',
                        component: () => <OrganizationRouteRedirect routeId="salesRepresentatives" />,
                      },
                      {
                        path: getOrganizationNestedRoutePath('products'),
                        component: ProductsPage,
                      },
                      {
                        path: getOrganizationNestedRoutePath('priceLists'),
                        component: PriceListsPage,
                      },
                      {
                        path: getOrganizationEntityRoutePath('priceList'),
                        component: PriceListPage,
                      },

                      {
                        path: '/invoicing/calendar',
                        component: () => <OrganizationRouteRedirect routeId="calendar" />,
                      },
                      {
                        path: '/invoicing/invoices/*rest',
                        component: LegacyInvoicesRedirect,
                      },
                      {
                        path: '/invoicing',
                        component: () => <OrganizationRouteRedirect routeId="invoices" />,
                      },
                      {
                        path: '/deleted',
                        component: () => <OrganizationRouteRedirect routeId="deletedDocuments" />,
                      },
                      {
                        path: '/tags',
                        component: () => <OrganizationRouteRedirect routeId="settingsTags" />,
                      },
                      {
                        path: '/custom-properties',
                        component: () => <OrganizationRouteRedirect routeId="settingsCustomProperties" />,
                      },
                      {
                        path: '/custom-properties/create',
                        component: CreateCustomPropertyPage,
                      },
                      {
                        path: '/custom-properties/:propertyDefinitionId',
                        component: UpdateCustomPropertyPage,
                      },
                      {
                        path: '/tagging-rules',
                        component: () => <OrganizationRouteRedirect routeId="settingsAutomations" />,
                      },
                      {
                        path: '/tagging-rules/create',
                        component: CreateTaggingRulePage,
                      },
                      {
                        path: '/tagging-rules/:taggingRuleId',
                        component: UpdateTaggingRulePage,
                      },
                      {
                        path: '/members',
                        component: () => <OrganizationRouteRedirect routeId="settingsMembers" />,
                      },
                      {
                        path: '/finances',
                        children: [
                          {
                            path: '/',
                            component: () => <Navigate href="overview" />,
                          },
                          {
                            path: '/overview',
                            component: OverviewPage,
                          },
                          {
                            path: '/transactions',
                            component: TransactionsPage,
                          },
                          {
                            path: '/subscriptions',
                            component: SubscriptionsPage,
                          },
                          {
                            path: '/goals',
                            component: FinanceGoalsPage,
                          },
                        ],
                      },
                      {
                        path: getOrganizationNestedRoutePath('assistant'),
                        component: AiAssistantPage,
                      },
                      {
                        path: getOrganizationNestedRoutePath('more'),
                        component: OrganizationMorePage,
                      },
                      {
                        path: '/invite',
                        component: () => <OrganizationRouteRedirect routeId="settingsMembers" childPath="invite" />,
                      },
                      {
                        path: '/invitations',
                        component: () => <OrganizationRouteRedirect routeId="settingsMembers" childPath="invitations" />,
                      },

                    ],
                  },
                  {
                    path: '/documents/:documentId/pdf-viewer',
                    component: DocumentPdfViewerPage,
                  },
                ],
              },
              {
                path: '/:organizationId/settings',
                matchFilters: {
                  organizationId: ORGANIZATION_ID_PATTERN,
                },
                component: OrganizationSettingsLayout,
                children: [
                  {
                    path: '/',
                    component: OrganizationsSettingsPage,
                  },
                  {
                    path: getOrganizationNestedRoutePath('settingsMembers'),
                    component: MembersPage,
                  },
                  {
                    path: '/members/invite',
                    component: InviteMemberPage,
                  },
                  {
                    path: '/members/invitations',
                    component: InvitationsListPage,
                  },
                  {
                    path: getOrganizationNestedRoutePath('settingsModules'),
                    component: () => <OrganizationPlaceholder pageId="modules" />,
                  },
                  {
                    path: getOrganizationNestedRoutePath('settingsTags'),
                    component: TagsPage,
                  },
                  {
                    path: getOrganizationNestedRoutePath('settingsCustomProperties'),
                    component: CustomPropertiesPage,
                  },
                  {
                    path: '/documents/custom-properties/create',
                    component: CreateCustomPropertyPage,
                  },
                  {
                    path: '/documents/custom-properties/:propertyDefinitionId',
                    component: UpdateCustomPropertyPage,
                  },
                  {
                    path: getOrganizationNestedRoutePath('settingsAutomations'),
                    component: TaggingRulesPage,
                  },
                  {
                    path: '/documents/automations/create',
                    component: CreateTaggingRulePage,
                  },
                  {
                    path: '/documents/automations/:taggingRuleId',
                    component: UpdateTaggingRulePage,
                  },
                  {
                    path: getOrganizationNestedRoutePath('settingsIntakeEmails'),
                    component: IntakeEmailsPage,
                  },
                  {
                    path: getOrganizationNestedRoutePath('deletedDocuments'),
                    component: DeletedDocumentsPage,
                  },
                  {
                    path: getOrganizationNestedRoutePath('settingsFiscalProfile'),
                    component: FiscalProfilePage,
                  },
                  {
                    path: getOrganizationNestedRoutePath('settingsInvoiceSeries'),
                    component: InvoiceSeriesPage,
                  },
                  {
                    path: getOrganizationNestedRoutePath('settingsTaxes'),
                    component: TaxesPage,
                  },
                  {
                    path: getOrganizationNestedRoutePath('settingsVerifactu'),
                    component: VerifactuPage,
                  },
                  {
                    path: getOrganizationNestedRoutePath('settingsInvoiceBranding'),
                    component: InvoiceBrandingPage,
                  },
                  {
                    path: getOrganizationNestedRoutePath('settingsUsage'),
                    component: OrganizationUsagePage,
                  },
                  {
                    path: getOrganizationNestedRoutePath('settingsApp'),
                    component: InstallAppPage,
                  },
                  {
                    path: '/integrations/webhooks/create',
                    component: CreateWebhookPage,
                  },
                  {
                    path: '/integrations/webhooks/:webhookId',
                    component: EditWebhookPage,
                  },
                  {
                    path: getOrganizationNestedRoutePath('settingsWebhooks'),
                    component: WebhooksPage,
                  },
                  {
                    path: '/usage',
                    component: () => <OrganizationRouteRedirect routeId="settingsUsage" />,
                  },
                  {
                    path: '/intake-emails',
                    component: () => <OrganizationRouteRedirect routeId="settingsIntakeEmails" />,
                  },
                  {
                    path: '/webhooks',
                    component: () => <OrganizationRouteRedirect routeId="settingsWebhooks" />,
                  },
                  {
                    path: '/webhooks/create',
                    component: CreateWebhookPage,
                  },
                  {
                    path: '/webhooks/:webhookId',
                    component: EditWebhookPage,
                  },
                ],
              },
              {
                path: '/create',
                component: OrganizationSetupPage,
              },
              {
                path: '/:organizationId/setup',
                matchFilters: {
                  organizationId: ORGANIZATION_ID_PATTERN,
                },
                component: OrganizationSetupPage,
              },
              {
                path: '/first',
                component: () => <Navigate href="/onboarding" />,
              },
              {
                // A link built without an organization (/organizations/undefined/...) would otherwise be a 404 dead end,
                // and going back to it too: the root sends to the last organization used, or the list
                path: '/:organizationId/*rest',
                matchFilters: {
                  organizationId: (organizationId: string) => !ORGANIZATION_ID_PATTERN.test(organizationId) && !['create', 'first', 'deleted'].includes(organizationId),
                },
                component: () => <Navigate href="/" />,
              },
            ],
          },
          adminRoutes,
          gestoriaRoutes,
          {
            path: '/',
            component: SettingsLayout,
            children: [
              {
                path: '/settings',
                component: UserSettingsPage,
              },
              {
                path: '/api-keys',
                component: ApiKeysPage,
              },
              {
                path: '/api-keys/create',
                component: CreateApiKeyPage,
              },
              {
                path: '/invitations',
                component: InvitationsPage,
              },
            ],
          },
        ],
      },
    ],
  },
  {
    // Landing for gestorías: public for everyone, signed in or not, like any marketing page
    path: '/para-gestoria',
    component: () => <LandingPage audience="gestorias" />,
  },
  {
    path: '/login',
    component: () => <PublicOnlyPage children={<LoginPage />} />,
  },
  {
    path: '/register',
    component: () => <PublicOnlyPage children={<RegisterPage />} />,
  },
  {
    path: '/reset-password',
    component: () => <PublicOnlyPage children={<ResetPasswordPage />} />,
  },
  {
    path: '/request-password-reset',
    component: () => <PublicOnlyPage children={<RequestPasswordResetPage />} />,
  },
  {
    path: '/email-validation-required',
    component: () => <PublicOnlyPage children={<EmailValidationRequiredPage />} />,
  },
  {
    path: authPagesPaths.emailVerification,
    component: () => <PublicOnlyPage children={<EmailVerificationPage />} />,
  },
  {
    path: '/checkout-success',
    component: CheckoutSuccessPage,
  },
  {
    path: '/checkout-cancel',
    component: CheckoutCancelPage,
  },
  {
    // Opened on the phone from the QR code of the computer, with no session
    path: '/capture/:token',
    component: CapturePage,
  },
  {
    path: '*404',
    component: NotFoundPage,
  },
];
