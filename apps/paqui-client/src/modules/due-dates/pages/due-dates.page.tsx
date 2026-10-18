import type { DueDateBucket, DueDateDirection, DueDateSettings, InstalmentStatus, PaymentInstalment } from '../due-dates.types';
import type { ActiveFilter, FilterField } from '@/modules/ui/components/table-filters';
import { A, useNavigate, useParams, useSearchParams } from '@solidjs/router';
import { createMutation, useQuery } from '@tanstack/solid-query';
import { createEffect, createMemo, createSignal, For, Show, untrack } from 'solid-js';
import { useI18n } from '@/modules/i18n/i18n.provider';
import { CatalogCell, CatalogRow, CatalogTable, FormField } from '@/modules/invoicing/components/catalog-page';
import { queryClient } from '@/modules/shared/query/query-client';
import { cn } from '@/modules/shared/style/cn';
import { Button } from '@/modules/ui/components/button';
import { EntityIcon } from '@/modules/ui/components/entity-icon';
import { ResponsiveDialog } from '@/modules/ui/components/responsive-dialog';
import { RowActions } from '@/modules/ui/components/row-actions';
import { SimpleSelect } from '@/modules/ui/components/simple-select';
import { createToast } from '@/modules/ui/components/sonner';
import { Switch, SwitchControl, SwitchThumb } from '@/modules/ui/components/switch';
import { getActiveFilter, toDistinctFilterOptions } from '@/modules/ui/components/table-filters';
import { TableToolbar } from '@/modules/ui/components/table-toolbar';
import { TextField } from '@/modules/ui/components/textfield';
import { getOrganizationRouteChildHref, getOrganizationRouteHref } from '@/modules/ui/navigation/organization-navigation';
import { useLinkWithReturn } from '@/modules/ui/navigation/return-to';
import { DUE_DATE_BUCKET_LABEL_I18N_KEYS, DUE_DATE_BUCKETS, INSTALMENT_STATUS_BADGE_CLASSES, INSTALMENT_STATUS_LABEL_I18N_KEYS, INSTALMENT_STATUSES, PAYMENT_METHOD_LABEL_I18N_KEYS, PAYMENT_METHODS } from '../due-dates.constants';
import { getDaysUntil, getDueDateBucket, summarizeDueDates } from '../due-dates.models';
import { fetchDueDates, fetchDueDateSettings, getDueDateSettingsQueryKey, getDueDatesQueryKey, setInstalmentStatus, updateDueDateSettings } from '../due-dates.services';

const DEFAULT_STATUS_FILTER: ActiveFilter = { fieldId: 'status', value: ['pending', 'returned'] };

const BUCKET_CLASSES: Record<DueDateBucket, string> = {
  overdue: 'border-red-500/30 bg-red-500/6',
  next_30: 'border-orange-500/30 bg-orange-500/6',
  days_31_60: 'bg-card',
  days_61_90: 'bg-card',
  later: 'bg-card',
};

// What is due, to pay (received invoices) and to collect (issued ones): totals per period and every due date,
// each one marked paid or returned in one click
export function DueDatesPage() {
  const { t, getLocale, formatDate } = useI18n();
  const params = useParams();
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const direction = (): DueDateDirection => (searchParams.tab === 'receivable' ? 'receivable' : 'payable');
  const [search, setSearch] = createSignal('');
  // Due dates changed from this page stay listed with their previous status, whatever the filters, until the page is
  // reloaded: a click by mistake is undone right there instead of looking for the invoice elsewhere
  const [changed, setChanged] = createSignal<ReadonlyMap<string, InstalmentStatus>>(new Map());
  const [filters, setFilters] = createSignal<ActiveFilter[]>([DEFAULT_STATUS_FILTER]);
  const [isSettingsOpen, setIsSettingsOpen] = createSignal(false);

  const query = useQuery(() => ({ queryKey: getDueDatesQueryKey({ organizationId: params.organizationId }), queryFn: () => fetchDueDates({ organizationId: params.organizationId }) }));
  const settingsQuery = useQuery(() => ({ queryKey: getDueDateSettingsQueryKey({ organizationId: params.organizationId }), queryFn: () => fetchDueDateSettings({ organizationId: params.organizationId }) }));

  const all = () => query.data?.instalments ?? [];
  const ofDirection = createMemo(() => all().filter(instalment => instalment.direction === direction()));
  const countOwed = (value: DueDateDirection) => all().filter(instalment => instalment.direction === value && instalment.status !== 'paid').length;

  const filterFields = createMemo((): FilterField[] => [
    {
      id: 'contact',
      type: 'multi-select',
      label: direction() === 'payable' ? t('due-dates.table.supplier') : t('due-dates.table.customer'),
      icon: 'i-tabler-building',
      options: toDistinctFilterOptions(ofDirection(), instalment => ({ value: instalment.contactId, label: instalment.contactName })),
    },
    {
      id: 'method',
      type: 'multi-select',
      label: t('due-dates.table.method'),
      icon: 'i-tabler-credit-card',
      options: [...PAYMENT_METHODS.map(method => ({ value: method, label: t(PAYMENT_METHOD_LABEL_I18N_KEYS[method]) })), { value: 'none', label: t('due-dates.schedule.method.none') }],
    },
    {
      id: 'status',
      type: 'multi-select',
      label: t('due-dates.table.status'),
      icon: 'i-tabler-progress-check',
      options: INSTALMENT_STATUSES.map(status => ({ value: status, label: t(INSTALMENT_STATUS_LABEL_I18N_KEYS[status]) })),
    },
    {
      id: 'period',
      type: 'select',
      label: t('due-dates.table.period'),
      icon: 'i-tabler-calendar-time',
      options: DUE_DATE_BUCKETS.map(bucket => ({ value: bucket, label: t(DUE_DATE_BUCKET_LABEL_I18N_KEYS[bucket]) })),
    },
  ]);

  const selected = (fieldId: string) => {
    const value = getActiveFilter(filters(), fieldId)?.value;
    return Array.isArray(value) && value.length > 0 ? value : undefined;
  };

  // The totals follow the contact and method filters (not the status and period ones, they are what the totals split)
  const scoped = createMemo(() => {
    const contacts = selected('contact');
    const methods = selected('method');
    const term = search().trim().toLowerCase();

    return ofDirection()
      .filter(instalment => !contacts || contacts.includes(instalment.contactId))
      .filter(instalment => !methods || methods.includes(instalment.paymentMethod ?? 'none'))
      .filter(instalment => `${instalment.contactName} ${instalment.documentNumber ?? ''}`.toLowerCase().includes(term));
  });

  const rows = createMemo(() => {
    const statuses = selected('status');
    const periods = selected('period');

    return scoped()
      .filter(instalment => changed().has(instalment.id) || ((!statuses || statuses.includes(instalment.status)) && (!periods || periods.includes(getDueDateBucket(instalment)))));
  });

  const summary = createMemo(() => summarizeDueDates({ instalments: scoped() }));
  const currency = () => ofDirection()[0]?.currency ?? 'EUR';
  const money = (minor: number, code = currency()) => new Intl.NumberFormat(getLocale(), { style: 'currency', currency: code }).format(minor / 100);

  const selectPeriod = (bucket: DueDateBucket) => {
    const isSelected = selected('period')?.includes(bucket) ?? false;
    setFilters(current => [
      ...current.filter(({ fieldId }) => fieldId !== 'period' && fieldId !== 'status'),
      ...(isSelected ? [DEFAULT_STATUS_FILTER] : [{ fieldId: 'period', value: [bucket] }, DEFAULT_STATUS_FILTER]),
    ]);
  };

  const linkWithReturn = useLinkWithReturn();
  const documentHref = (instalment: PaymentInstalment) => linkWithReturn(instalment.purchaseInvoiceId
    ? getOrganizationRouteChildHref({ organizationId: params.organizationId, routeId: 'purchases', childPath: `${instalment.purchaseInvoiceId}/edit` })
    : getOrganizationRouteChildHref({ organizationId: params.organizationId, routeId: 'invoices', childPath: `${instalment.invoiceId}/edit` }));

  const relativeDays = (instalment: PaymentInstalment) => {
    if (instalment.status === 'paid') {
      return instalment.paidAt ? t('due-dates.table.paid-on', { date: formatDate(instalment.paidAt) }) : '';
    }
    const days = getDaysUntil(instalment);
    return days === 0 ? t('due-dates.relative.today') : days > 0 ? t('due-dates.relative.in', { count: days }) : t('due-dates.relative.late', { count: -days });
  };

  const statusMutation = createMutation(() => ({
    mutationFn: ({ instalmentId, status }: { instalmentId: string; status: InstalmentStatus; previousStatus: InstalmentStatus }) => setInstalmentStatus({ organizationId: params.organizationId, instalmentId, status }),
    onSuccess: async (_, { instalmentId, status, previousStatus }) => {
      createToast({ type: 'success', message: t(`due-dates.toast.${status}`) });
      setChanged((current) => {
        const next = new Map(current);
        // The first status seen is the one an undo goes back to
        if (!next.has(instalmentId)) {
          next.set(instalmentId, previousStatus);
        }
        return next;
      });
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: getDueDatesQueryKey({ organizationId: params.organizationId }) }),
        queryClient.invalidateQueries({ queryKey: ['organizations', params.organizationId, 'purchases'] }),
        queryClient.invalidateQueries({ queryKey: ['invoicing', params.organizationId] }),
        queryClient.invalidateQueries({ queryKey: ['calendar', params.organizationId] }),
      ]);
    },
    onError: () => createToast({ type: 'error', message: t('due-dates.toast.error') }),
  }));

  const quickActions = (instalment: PaymentInstalment) => [
    ...(instalment.status !== 'paid' ? [{ label: instalment.direction === 'payable' ? t('due-dates.actions.mark-paid') : t('due-dates.actions.mark-collected'), icon: 'i-tabler-check', onSelect: () => statusMutation.mutate({ instalmentId: instalment.id, status: 'paid', previousStatus: instalment.status }) }] : []),
    ...(instalment.status !== 'returned' ? [{ label: t('due-dates.actions.mark-returned'), icon: 'i-tabler-arrow-back-up', onSelect: () => statusMutation.mutate({ instalmentId: instalment.id, status: 'returned', previousStatus: instalment.status }) }] : []),
    ...(instalment.status !== 'pending' ? [{ label: t('due-dates.actions.mark-pending'), icon: 'i-tabler-clock', onSelect: () => statusMutation.mutate({ instalmentId: instalment.id, status: 'pending', previousStatus: instalment.status }) }] : []),
  ];

  return (
    <main class="page">
      <div class="page-header">
        <div>
          <h1 class="page-title">{t('due-dates.title')}</h1>
          <p class="page-description">{t('due-dates.description')}</p>
        </div>
        <div class="flex gap-2 max-sm:w-full">
          <Button size="sm" variant="outline" class="gap-1.5 max-sm:flex-1" onClick={() => setIsSettingsOpen(true)}>
            <div class={cn('size-4', settingsQuery.data?.settings.emailRemindersEnabled ? 'i-tabler-bell-ringing' : 'i-tabler-bell')} />
            {t('due-dates.settings.button')}
          </Button>
          <Button size="sm" as={A} href={getOrganizationRouteHref({ organizationId: params.organizationId, routeId: 'calendar' })} variant="outline" class="gap-1.5 max-sm:flex-1">
            <div class="i-tabler-calendar-month size-4" />
            {t('due-dates.calendar')}
          </Button>
        </div>
      </div>

      <div role="tablist" class="mb-4 inline-flex rounded-lg border bg-muted/40 p-1 max-sm:flex">
        <For each={['payable', 'receivable'] as const}>
          {tab => (
            <button
              type="button"
              role="tab"
              aria-selected={direction() === tab}
              class={cn('flex items-center gap-2 rounded-md px-3 py-1.5 text-sm font-medium transition-colors max-sm:flex-1 max-sm:justify-center', direction() === tab ? 'bg-background shadow-xs' : 'text-muted-foreground hover:text-foreground')}
              onClick={() => {
                setSearchParams({ tab: tab === 'payable' ? undefined : tab });
                setFilters([DEFAULT_STATUS_FILTER]);
              }}
            >
              <div class={cn('size-4', tab === 'payable' ? 'i-tabler-arrow-up-right' : 'i-tabler-arrow-down-left')} />
              {tab === 'payable' ? t('due-dates.tabs.payable') : t('due-dates.tabs.receivable')}
              <Show when={countOwed(tab) > 0}>
                <span class="rounded-full bg-muted px-1.5 text-xs tabular-nums text-muted-foreground">{countOwed(tab)}</span>
              </Show>
            </button>
          )}
        </For>
      </div>

      <div class="mb-5 grid grid-cols-2 gap-2.5 sm:grid-cols-3 lg:grid-cols-5">
        <For each={DUE_DATE_BUCKETS}>
          {bucket => (
            <button
              type="button"
              class={cn('rounded-xl border p-3.5 text-left transition-colors hover:border-primary/50', BUCKET_CLASSES[bucket], selected('period')?.includes(bucket) && 'ring-2 ring-primary')}
              onClick={() => selectPeriod(bucket)}
            >
              <div class="text-xs font-medium text-muted-foreground">{t(DUE_DATE_BUCKET_LABEL_I18N_KEYS[bucket])}</div>
              <div class={cn('mt-1 text-lg font-semibold tabular-nums', bucket === 'overdue' && summary().overdue.amountMinor > 0 && 'text-red-700 dark:text-red-300')}>{money(summary()[bucket].amountMinor)}</div>
              <div class="text-xs text-muted-foreground">{t('due-dates.buckets.count', { count: summary()[bucket].count })}</div>
            </button>
          )}
        </For>
      </div>

      <TableToolbar search={search()} onSearchChange={setSearch} searchPlaceholder={t('invoicing.common.search')} fields={filterFields()} filters={filters()} onFiltersChange={setFilters} />

      <Show
        when={query.isLoading || rows().length > 0}
        fallback={(
          <div class="rounded-xl border border-dashed py-14 text-center">
            <div class="i-tabler-calendar-check mx-auto mb-3 size-9 text-muted-foreground/50" />
            <p class="font-medium">{direction() === 'payable' ? t('due-dates.empty.payable') : t('due-dates.empty.receivable')}</p>
            <p class="mx-auto mt-1 max-w-md text-sm text-muted-foreground">{t('due-dates.empty.description')}</p>
            <Show when={direction() === 'payable'}>
              <Button size="sm" class="mt-4 gap-1.5" as={A} href={getOrganizationRouteHref({ organizationId: params.organizationId, routeId: 'purchases' })}>
                <div class="i-tabler-file-upload size-4" />
                {t('due-dates.empty.upload')}
              </Button>
            </Show>
          </div>
        )}
      >
        <CatalogTable headers={[
          { label: t('due-dates.table.due-date') },
          { label: direction() === 'payable' ? t('due-dates.table.supplier') : t('due-dates.table.customer') },
          { label: t('due-dates.table.document') },
          { label: t('due-dates.table.method') },
          { label: t('due-dates.table.amount'), class: 'text-right' },
          { label: t('due-dates.table.status') },
          { label: '', class: 'w-14' },
        ]}
        >
          <For each={rows()}>
            {instalment => (
              <CatalogRow onClick={() => navigate(documentHref(instalment))} class={cn(changed().has(instalment.id) && instalment.status === 'paid' && 'opacity-60')}>
                <CatalogCell class="whitespace-nowrap">
                  <div class="font-medium tabular-nums">{formatDate(instalment.dueDate)}</div>
                  <div class={cn('text-xs', getDueDateBucket(instalment) === 'overdue' && instalment.status !== 'paid' ? 'text-red-600 dark:text-red-400' : 'text-muted-foreground')}>{relativeDays(instalment)}</div>
                </CatalogCell>
                <CatalogCell primary>
                  <div class="flex min-w-0 items-center gap-2.5">
                    <EntityIcon icon={instalment.contactIcon} color={instalment.contactIconColor} fallback="i-tabler-building" />
                    <span class="truncate font-medium">{instalment.contactName}</span>
                  </div>
                </CatalogCell>
                <CatalogCell class="text-muted-foreground">
                  <div class="flex items-center gap-1.5">
                    {instalment.documentNumber ?? '—'}
                    <Show when={instalment.documentId}>
                      <div class="i-tabler-paperclip size-3.5" title={t('due-dates.table.has-document')} />
                    </Show>
                  </div>
                </CatalogCell>
                <CatalogCell class="text-muted-foreground">{instalment.paymentMethod ? t(PAYMENT_METHOD_LABEL_I18N_KEYS[instalment.paymentMethod]) : '—'}</CatalogCell>
                <CatalogCell class="text-right font-medium tabular-nums">{money(instalment.amountMinor, instalment.currency)}</CatalogCell>
                <CatalogCell>
                  <span class={cn('rounded-full px-2 py-0.5 text-xs font-medium whitespace-nowrap', INSTALMENT_STATUS_BADGE_CLASSES[instalment.status])}>{t(INSTALMENT_STATUS_LABEL_I18N_KEYS[instalment.status])}</span>
                </CatalogCell>
                <CatalogCell>
                  <div class="flex items-center justify-end gap-1" onClick={event => event.stopPropagation()}>
                    <Show
                      when={changed().get(instalment.id) !== undefined && changed().get(instalment.id) !== instalment.status}
                      fallback={(
                        <Show when={instalment.status !== 'paid'}>
                          <Button size="sm" variant="ghost" class="h-8 gap-1 px-2 text-xs max-md:hidden" onClick={() => statusMutation.mutate({ instalmentId: instalment.id, status: 'paid', previousStatus: instalment.status })}>
                            <div class="i-tabler-check size-4" />
                            {instalment.direction === 'payable' ? t('due-dates.actions.paid') : t('due-dates.actions.collected')}
                          </Button>
                        </Show>
                      )}
                    >
                      <Button size="sm" variant="outline" class="h-8 gap-1 px-2 text-xs" onClick={() => statusMutation.mutate({ instalmentId: instalment.id, status: changed().get(instalment.id)!, previousStatus: instalment.status })}>
                        <div class="i-tabler-arrow-back-up size-4" />
                        {t('due-dates.actions.undo')}
                      </Button>
                    </Show>
                    <RowActions itemName={`${instalment.contactName} ${instalment.documentNumber ?? ''}`} actions={quickActions(instalment)} onEdit={() => navigate(documentHref(instalment))} />
                  </div>
                </CatalogCell>
              </CatalogRow>
            )}
          </For>
        </CatalogTable>
      </Show>

      <Show when={settingsQuery.data?.settings}>
        {getSettings => <DueDateSettingsDialog open={isSettingsOpen()} onOpenChange={setIsSettingsOpen} settings={getSettings()} organizationId={params.organizationId} />}
      </Show>
    </main>
  );
}

function DueDateSettingsDialog(props: { open: boolean; onOpenChange: (open: boolean) => void; settings: DueDateSettings; organizationId: string }) {
  const { t } = useI18n();
  // Edited as a copy, reset from the saved settings each time the dialog opens
  const [draft, setDraft] = createSignal<DueDateSettings>(untrack(() => props.settings));

  createEffect(() => {
    if (props.open) {
      setDraft(props.settings);
    }
  });

  const update = (changes: Partial<DueDateSettings>) => setDraft(current => ({ ...current, ...changes }));

  const saveMutation = createMutation(() => ({
    mutationFn: () => updateDueDateSettings({ organizationId: props.organizationId, settings: { ...draft(), reminderEmail: draft().reminderEmail?.trim() || null } }),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: getDueDateSettingsQueryKey({ organizationId: props.organizationId }) });
      createToast({ type: 'success', message: t('due-dates.settings.saved') });
      props.onOpenChange(false);
    },
    onError: () => createToast({ type: 'error', message: t('due-dates.toast.error') }),
  }));

  const toggle = (label: string, description: string, checked: boolean, onChange: (value: boolean) => void) => (
    <Switch class="flex items-start justify-between gap-4" checked={checked} onChange={onChange}>
      <div>
        <div class="text-sm font-medium">{label}</div>
        <div class="text-sm text-muted-foreground">{description}</div>
      </div>
      <SwitchControl class="mt-0.5"><SwitchThumb /></SwitchControl>
    </Switch>
  );

  return (
    <ResponsiveDialog open={props.open} onOpenChange={props.onOpenChange} title={t('due-dates.settings.title')} description={t('due-dates.settings.description')}>
      <div class="flex flex-col gap-5">
        {toggle(t('due-dates.settings.email'), t('due-dates.settings.email.description'), draft().emailRemindersEnabled, value => update({ emailRemindersEnabled: value }))}
        <Show when={draft().emailRemindersEnabled}>
          <div class="grid gap-4 sm:grid-cols-2">
            <FormField label={t('due-dates.settings.recipient')}>
              <TextField type="email" placeholder={t('due-dates.settings.recipient.placeholder')} value={draft().reminderEmail ?? ''} onInput={event => update({ reminderEmail: event.currentTarget.value })} />
            </FormField>
            <FormField label={t('due-dates.settings.days-before')}>
              <SimpleSelect triggerClass="h-10 w-full" value={String(draft().reminderDaysBefore)} onChange={value => update({ reminderDaysBefore: Number(value) })} options={[0, 1, 3, 5, 7, 15].map(days => ({ value: String(days), label: days === 0 ? t('due-dates.settings.days-before.none') : t('due-dates.settings.days-before.value', { count: days }) }))} />
            </FormField>
          </div>
        </Show>
        {toggle(t('due-dates.settings.intake'), t('due-dates.settings.intake.description'), draft().readIntakeEmailAttachments, value => update({ readIntakeEmailAttachments: value }))}
        <div class="flex justify-end gap-2">
          <Button variant="ghost" onClick={() => props.onOpenChange(false)}>{t('due-dates.settings.cancel')}</Button>
          <Button isLoading={saveMutation.isPending} onClick={() => saveMutation.mutate()}>{t('due-dates.settings.save')}</Button>
        </div>
      </div>
    </ResponsiveDialog>
  );
}
