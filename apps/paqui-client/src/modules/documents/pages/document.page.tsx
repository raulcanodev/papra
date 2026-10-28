import type { DropdownMenuTriggerProps } from '@kobalte/core/dropdown-menu';
import type { Component, JSX } from 'solid-js';
import type { Document, DocumentActivity } from '../documents.types';
import { formatBytes } from '@corentinth/chisels';
import { A, useNavigate, useParams, useSearchParams } from '@solidjs/router';
import { useInfiniteQuery, useQuery } from '@tanstack/solid-query';
import { createEffect, createSignal, For, Match, Show, Suspense, Switch } from 'solid-js';
import { useConfig } from '@/modules/config/config.provider';
import { DocumentCustomPropertiesPanel } from '@/modules/custom-properties/components/document-custom-properties-panel.component';
import { fetchCustomPropertyDefinitions } from '@/modules/custom-properties/custom-properties.services';
import { RelativeTime } from '@/modules/i18n/components/RelativeTime';
import { useI18n } from '@/modules/i18n/i18n.provider';
import { fetchInvoices } from '@/modules/invoicing/invoicing.services';
import { invoiceStatusLabelKeys } from '@/modules/invoicing/pages/invoices.page';
import { EXTRACTABLE_FILE_ACCEPT, PURCHASE_DOCUMENT_KIND_LABEL_I18N_KEYS } from '@/modules/purchases/purchases.constants';
import { fetchPurchaseInvoices, getPurchaseInvoicesQueryKey } from '@/modules/purchases/purchases.services';
import { downloadFile } from '@/modules/shared/files/download';
import { DocumentTagsList } from '@/modules/tags/components/tag-list.component';
import { TagLink } from '@/modules/tags/components/tag.component';
import { Alert } from '@/modules/ui/components/alert';
import { Button } from '@/modules/ui/components/button';
import { DropdownMenu, DropdownMenuContent, DropdownMenuTrigger } from '@/modules/ui/components/dropdown-menu';
import { Separator } from '@/modules/ui/components/separator';
import { Tabs, TabsContent, TabsIndicator, TabsList, TabsTrigger } from '@/modules/ui/components/tabs';
import { getOrganizationContactHref, getOrganizationRouteChildHref } from '@/modules/ui/navigation/organization-navigation';
import { useLinkWithReturn, useReturnHref } from '@/modules/ui/navigation/return-to';
import { RETURN_TO_SEARCH_PARAM } from '@/modules/ui/navigation/return-to.models';
import { DocumentContentEditionPanel } from '../components/document-content-edition-panel.component';
import { DocumentDatePicker } from '../components/document-date-picker.component';
import { DocumentPreview } from '../components/document-preview.component';
import { DocumentOpenWithDropdownItems } from '../components/open-with.component';
import { useRenameDocumentDialog } from '../components/rename-document-button.component';
import { getDaysBeforePermanentDeletion, getDocumentActivityIcon, getDocumentOpenWithApps } from '../document.models';
import { useDeleteDocument, useRestoreDocument } from '../documents.composables';
import { fetchDocument, fetchDocumentActivities, fetchDocumentFile } from '../documents.services';

type KeyValueItem = {
  label: string | JSX.Element;
  value: string | JSX.Element;
  icon?: string;
};

const KeyValues: Component<{ data?: KeyValueItem[] }> = (props) => {
  return (
    <For each={props.data}>
      {item => (
        <>
          <div class="py-1 pr-2 text-sm text-muted-foreground flex items-center gap-2 whitespace-nowrap">
            {item.icon && <div class={item.icon} />}
            {item.label}
          </div>
          <div class="min-w-0 py-1 pl-2 text-sm break-words">{item.value}</div>
        </>
      )}
    </For>
  );
};

const ActivityItem: Component<{ activity: DocumentActivity }> = (props) => {
  const { t, te } = useI18n();
  const params = useParams();

  return (
    <div class="border-b py-3 flex items-center gap-2">
      <div>
        <div class={`${getDocumentActivityIcon({ event: props.activity.event })} size-6 text-muted-foreground`} />
      </div>
      <div>
        <Switch fallback={<span class="text-sm">{t(`activity.document.${props.activity.event}`)}</span>}>
          <Match when={['tagged', 'untagged'].includes(props.activity.event)}>
            <span class="text-sm flex items-baseline gap-1">
              {te(`activity.document.${props.activity.event}`, { tag: props.activity.tag ? <TagLink {...props.activity.tag} organizationId={params.organizationId} class="text-xs" /> : undefined })}
            </span>
          </Match>

          <Match when={props.activity.event === 'updated' && (props.activity.eventData.updatedFields as string[]).length === 1}>
            <span class="text-sm flex items-baseline gap-1">
              {te(`activity.document.updated.single`, {
                field: <span class="font-bold">{(props.activity.eventData.updatedFields as string[])[0]}</span>,
              })}
            </span>
          </Match>

          <Match when={props.activity.event === 'updated' && (props.activity.eventData.updatedFields as string[]).length > 1}>
            <span class="text-sm flex items-baseline gap-1">
              {te(`activity.document.updated.multiple`, { fields: (props.activity.eventData.updatedFields as string[]).join(', ') })}
            </span>
          </Match>

        </Switch>

        <div class="flex items-center gap-1 text-xs text-muted-foreground">
          <RelativeTime date={props.activity.createdAt} />
          <Show when={props.activity.user}>
            {getUser => (
              <span>{te('activity.document.user.name', { name: <A href={`/organizations/${params.organizationId}/members`} class="underline hover:text-primary transition">{getUser().name}</A> })}</span>
            )}
          </Show>
        </div>
      </div>
    </div>
  );
};

const tabs = ['info', 'content', 'activity'] as const;
type Tab = typeof tabs[number];

const DocumentOpenWithDropdown: Component<{ document: Document; organizationId: string }> = (props) => {
  const { t } = useI18n();
  const getApps = () => getDocumentOpenWithApps({ document: props.document });

  return (
    <Show when={getApps().length > 0}>
      <DropdownMenu>
        <DropdownMenuTrigger
          as={(triggerProps: DropdownMenuTriggerProps) => (
            <Button variant="outline" size="sm" {...triggerProps}>
              <div class="i-tabler-app-window size-4 mr-2" />
              {t('documents.open-with.label')}
              <div class="i-tabler-chevron-down size-3 ml-1" />
            </Button>
          )}
        />
        <DropdownMenuContent>
          <DocumentOpenWithDropdownItems apps={getApps()} />
        </DropdownMenuContent>
      </DropdownMenu>
    </Show>
  );
};

export const DocumentPage: Component = () => {
  const { t, formatRelativeTime, getLocale } = useI18n();
  const params = useParams();
  const linkWithReturn = useLinkWithReturn();
  const [searchParams, setSearchParams] = useSearchParams();
  const { deleteDocument } = useDeleteDocument();
  const { restore, getIsRestoring } = useRestoreDocument();
  const navigate = useNavigate();
  const { config } = useConfig();
  const { openRenameDialog } = useRenameDocumentDialog();
  // Opened from a list (sales, purchases...): a way back to it
  const { returnHref } = useReturnHref(() => `/organizations/${params.organizationId}/documents`);

  // The issued invoice or the purchase this file is the paper of: the actions offered depend on it
  const invoicesQuery = useQuery(() => ({ queryKey: ['invoicing', params.organizationId, 'invoices'], queryFn: () => fetchInvoices({ organizationId: params.organizationId }) }));
  const purchasesQuery = useQuery(() => ({ queryKey: getPurchaseInvoicesQueryKey({ organizationId: params.organizationId }), queryFn: () => fetchPurchaseInvoices({ organizationId: params.organizationId }) }));
  const linkedInvoice = () => invoicesQuery.data?.invoices.find(invoice => invoice.documentId === params.documentId);
  const linkedPurchase = () => purchasesQuery.data?.purchaseInvoices.find(purchaseInvoice => purchaseInvoice.documentId === params.documentId);
  const isLinkLookupDone = () => invoicesQuery.isSuccess && purchasesQuery.isSuccess;
  const formatMoney = (minor: number, currency: string) => new Intl.NumberFormat(getLocale(), { style: 'currency', currency }).format(minor / 100);

  const getInitialTab = (): Tab => {
    const tab = searchParams.tab;
    if (tab && typeof tab === 'string' && tabs.includes(tab as Tab)) {
      return tab as Tab;
    }
    return 'info';
  };

  const [getTab, setTab] = createSignal<Tab>(getInitialTab());

  createEffect(() => {
    setSearchParams({ tab: getTab() }, { replace: true });
  });

  const documentQuery = useQuery(() => ({
    queryKey: ['organizations', params.organizationId, 'documents', params.documentId],
    queryFn: () => fetchDocument({ documentId: params.documentId, organizationId: params.organizationId }),
  }));

  const documentFileQuery = useQuery(() => ({
    queryKey: ['organizations', params.organizationId, 'documents', params.documentId, 'file'],
    queryFn: () => fetchDocumentFile({ documentId: params.documentId, organizationId: params.organizationId }),
  }));

  const customPropertyDefinitionsQuery = useQuery(() => ({
    queryKey: ['organizations', params.organizationId, 'custom-properties', { entityType: 'document' }],
    queryFn: () => fetchCustomPropertyDefinitions({ organizationId: params.organizationId, entityType: 'document' }),
  }));

  const activityPageSize = 20;
  const activityQuery = useInfiniteQuery(() => ({
    enabled: getTab() === 'activity',
    queryKey: ['organizations', params.organizationId, 'documents', params.documentId, 'activity'],
    queryFn: async ({ pageParam }) => {
      const { activities } = await fetchDocumentActivities({
        documentId: params.documentId,
        organizationId: params.organizationId,
        pageIndex: pageParam,
        pageSize: activityPageSize,
      });

      return activities;
    },
    getNextPageParam: (lastPage, _pages, lastPageParam) => {
      if (lastPage.length < activityPageSize) {
        return undefined;
      }

      return lastPageParam + 1;
    },
    initialPageParam: 0,
  }));

  const deleteDoc = async () => {
    if (!documentQuery.data) {
      return;
    }

    const { hasDeleted } = await deleteDocument({
      documentId: params.documentId,
      organizationId: params.organizationId,
      documentName: documentQuery.data.document.name,
    });

    if (!hasDeleted) {
      return;
    }

    navigate(`/organizations/${params.organizationId}/documents`);
  };

  const getDataUrl = () => documentFileQuery.data ? URL.createObjectURL(documentFileQuery.data) : undefined;

  return (
    <div class="page-full gap-6 md:flex-row">
      <Suspense>
        <div class="min-w-0 md:flex-1 md:border-r">
          <Show when={documentQuery.data?.document}>
            {getDocument => (
              <div class="flex gap-4 md:pr-6">
                <div class="min-w-0 flex-1">
                  <Show when={searchParams[RETURN_TO_SEARCH_PARAM]}>
                    <A href={returnHref()} class="mb-3 inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
                      <div class="i-tabler-arrow-left size-4" />
                      {t('layout.back')}
                    </A>
                  </Show>
                  <Button
                    variant="ghost"
                    class="flex max-w-full items-center gap-2 group bg-transparent! px-0 text-left h-auto whitespace-normal"
                    onClick={() => openRenameDialog({
                      documentId: getDocument().id,
                      organizationId: params.organizationId,
                      documentName: getDocument().name,
                    })}
                  >
                    <h1 class="min-w-0 text-xl font-semibold lh-tight break-words" title={getDocument().name}>
                      {getDocument().name}
                    </h1>

                    <div class="i-tabler-pencil size-4 text-muted-foreground group-hover:text-foreground transition-colors flex-shrink-0" />
                  </Button>
                  <p class="text-sm text-muted-foreground mb-6 break-all">{getDocument().id}</p>

                  {/* What the file already is in the books, so it is not registered a second time */}
                  <Show when={linkedInvoice()}>
                    {getInvoice => (
                      <div class="mb-4 flex items-start gap-3 rounded-lg border border-emerald-500/30 bg-emerald-500/8 p-3 text-sm">
                        <div class="i-tabler-file-invoice mt-0.5 size-4 shrink-0 text-emerald-600 dark:text-emerald-400" />
                        <div class="min-w-0 flex-1">
                          <div class="font-medium">{t('documents.linked.issued-invoice', { number: getInvoice().number ?? '—' })}</div>
                          <div class="text-muted-foreground">
                            {[getInvoice().customerName, formatMoney(getInvoice().totalMinor, getInvoice().currency), t(invoiceStatusLabelKeys[getInvoice().status])].filter(Boolean).join(' · ')}
                          </div>
                        </div>
                        <A href={linkWithReturn(getOrganizationContactHref({ organizationId: params.organizationId, contactId: getInvoice().customerId }))} class="shrink-0 text-sm font-medium hover:underline">
                          {t('documents.linked.open-customer')}
                        </A>
                      </div>
                    )}
                  </Show>
                  <Show when={linkedPurchase()}>
                    {getPurchase => (
                      <div class="mb-4 flex items-start gap-3 rounded-lg border border-sky-500/30 bg-sky-500/8 p-3 text-sm">
                        <div class="i-tabler-receipt mt-0.5 size-4 shrink-0 text-sky-600 dark:text-sky-400" />
                        <div class="min-w-0 flex-1">
                          <div class="font-medium">{t('documents.linked.purchase', { kind: t(PURCHASE_DOCUMENT_KIND_LABEL_I18N_KEYS[getPurchase().kind]).toLowerCase(), number: getPurchase().number || '—' })}</div>
                          <div class="text-muted-foreground">{[getPurchase().supplierName, formatMoney(getPurchase().totalMinor, getPurchase().currency)].filter(Boolean).join(' · ')}</div>
                        </div>
                        <A href={linkWithReturn(getOrganizationRouteChildHref({ organizationId: params.organizationId, routeId: 'purchases', childPath: `${getPurchase().id}/edit` }))} class="shrink-0 text-sm font-medium hover:underline">
                          {t('documents.linked.open-purchase')}
                        </A>
                      </div>
                    )}
                  </Show>

                  {/* Two columns of full width buttons on phones, a single row on wider screens */}
                  <div class="mb-2 grid grid-cols-2 gap-2 sm:flex sm:flex-wrap [&>*]:w-full sm:[&>*]:w-auto">
                    <Button
                      onClick={() => downloadFile({ fileName: getDocument().name, url: getDataUrl()! })}
                      variant="outline"
                      size="sm"
                    >
                      <div class="i-tabler-download size-4 mr-2" />
                      {t('documents.actions.download')}
                    </Button>

                    <DocumentOpenWithDropdown document={getDocument()} organizationId={params.organizationId} />

                    {/* A received invoice (forwarded by email, uploaded...) becomes an expense reviewed in the purchase editor;
                        never offered for a file that is already an issued invoice or a registered purchase */}
                    <Show when={!getDocument().isDeleted && isLinkLookupDone() && !linkedInvoice() && !linkedPurchase() && (EXTRACTABLE_FILE_ACCEPT.split(',') as string[]).includes(getDocument().mimeType)}>
                      <Button
                        as={A}
                        variant="outline"
                        size="sm"
                        href={linkWithReturn(`${getOrganizationRouteChildHref({ organizationId: params.organizationId, routeId: 'purchases', childPath: 'new' })}?documentId=${getDocument().id}`)}
                      >
                        <div class="i-tabler-file-invoice size-4 mr-2" />
                        {t('purchases.actions.register-expense')}
                      </Button>
                    </Show>

                    {getDocument().isDeleted
                      ? (
                          <Button
                            variant="destructive"
                            size="sm"
                            onClick={() => restore({ document: getDocument() })}
                            isLoading={getIsRestoring()}
                          >
                            <div class="i-tabler-refresh size-4 mr-2" />
                            {t('documents.actions.restore')}
                          </Button>
                        )
                      : (
                          // The PDF of an issued invoice is a legal record: it stays with the invoice
                          <Show when={!linkedInvoice()}>
                            <Button
                              variant="destructive"
                              size="sm"
                              onClick={deleteDoc}
                            >
                              <div class="i-tabler-trash size-4 mr-2" />
                              {t('documents.actions.delete')}
                            </Button>
                          </Show>
                        )}
                  </div>
                  <Separator class="my-3" />

                  <DocumentTagsList
                    documentId={params.documentId}
                    organizationId={params.organizationId}
                    tags={getDocument().tags}
                    asLink
                  />

                  {getDocument().isDeleted && (
                    <Alert variant="destructive" class="mt-6">
                      {t('documents.deleted.message', { days: getDaysBeforePermanentDeletion({
                        document: getDocument(),
                        deletedDocumentsRetentionDays: config.documents.deletedDocumentsRetentionDays,
                      }) ?? 0 })}
                    </Alert>
                  )}

                  <Separator class="my-3" />

                  <Tabs value={getTab()} onChange={setTab} class="w-full">
                    <TabsList class="w-full h-8">
                      <TabsTrigger value="info">{t('documents.tabs.info')}</TabsTrigger>
                      <TabsTrigger value="content">{t('documents.tabs.content')}</TabsTrigger>
                      <TabsTrigger value="activity">{t('documents.tabs.activity')}</TabsTrigger>
                      <TabsIndicator />
                    </TabsList>

                    <TabsContent value="info">
                      <div class="grid grid-cols-[max-content_1fr]">
                        <KeyValues data={[
                          {
                            label: t('documents.info.id'),
                            value: getDocument().id,
                            icon: 'i-tabler-id',
                          },
                          {
                            label: t('documents.info.name'),
                            value: (
                              <Button
                                variant="ghost"
                                class="flex max-w-full items-center gap-2 group bg-transparent! p-0 h-auto text-left whitespace-normal break-words"
                                onClick={() => openRenameDialog({
                                  documentId: getDocument().id,
                                  organizationId: params.organizationId,
                                  documentName: getDocument().name,
                                })}
                              >
                                {getDocument().name}

                                <div class="i-tabler-pencil size-4 text-muted-foreground group-hover:text-foreground transition-colors flex-shrink-0" />
                              </Button>
                            ),
                            icon: 'i-tabler-file-text',
                          },
                          {
                            label: t('documents.info.type'),
                            value: getDocument().mimeType,
                            icon: 'i-tabler-file-unknown',
                          },
                          {
                            label: t('documents.info.size'),
                            value: formatBytes({ bytes: getDocument().originalSize, base: 1000 }),
                            icon: 'i-tabler-weight',
                          },
                          {
                            label: t('documents.info.document-date'),
                            value: <DocumentDatePicker document={getDocument()} organizationId={params.organizationId} />,
                            icon: 'i-tabler-calendar-event',
                          },
                          {
                            label: t('documents.info.created-at'),
                            value: formatRelativeTime(getDocument().createdAt),
                            icon: 'i-tabler-calendar',
                          },
                          {
                            label: t('documents.info.updated-at'),
                            value: getDocument().updatedAt ? formatRelativeTime(getDocument().updatedAt!) : <span class="text-muted-foreground">{t('documents.info.never')}</span>,
                            icon: 'i-tabler-calendar',
                          },
                        ]}
                        />

                        <Show when={customPropertyDefinitionsQuery.data?.propertyDefinitions}>
                          {getDefinitions => (
                            <DocumentCustomPropertiesPanel
                              document={getDocument()}
                              organizationId={params.organizationId}
                              propertyDefinitions={getDefinitions()}
                            />
                          )}
                        </Show>
                      </div>
                    </TabsContent>

                    <TabsContent value="content">
                      <DocumentContentEditionPanel
                        documentId={getDocument().id}
                        organizationId={params.organizationId}
                        content={getDocument().content}
                      />
                    </TabsContent>
                    <TabsContent value="activity">
                      <Show when={activityQuery.data?.pages}>
                        {getActivitiesPages => (
                          <div class="flex flex-col">
                            <For each={getActivitiesPages() ?? []}>
                              {activities => (
                                <For each={activities}>
                                  {activity => (
                                    <ActivityItem activity={activity} />
                                  )}
                                </For>
                              )}
                            </For>

                            <Show
                              when={activityQuery.hasNextPage}
                              fallback={(
                                <div class="text-sm text-muted-foreground text-center py-4">
                                  {t('activity.no-more-activities')}
                                </div>
                              )}
                            >
                              <Button
                                variant="outline"
                                onClick={() => activityQuery.fetchNextPage()}
                                isLoading={activityQuery.isFetchingNextPage}
                              >
                                {t('activity.load-more')}
                              </Button>
                            </Show>
                          </div>
                        )}
                      </Show>
                    </TabsContent>
                  </Tabs>

                </div>
              </div>
            )}
          </Show>
        </div>

        <div class="min-w-0 flex-1 min-h-50vh">
          <Show when={documentQuery.data?.document}>
            {getDocument => (
              <DocumentPreview document={getDocument()} />
            )}
          </Show>
        </div>
      </Suspense>
    </div>
  );
};
