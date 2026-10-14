import type { Component } from 'solid-js';
import type { Transaction } from '../finances.types';
import type { TranslationKeys } from '@/modules/i18n/locales.types';
import type { ActiveFilter, DateRangePreset, DateRangeValue, FilterField } from '@/modules/ui/components/table-filters';
import { useParams } from '@solidjs/router';
import { createMutation, keepPreviousData, useQuery, useQueryClient } from '@tanstack/solid-query';
import { createEffect, createMemo, createSignal, For, Match, Show, Switch } from 'solid-js';
import { getDocumentLocale } from '@/modules/i18n/document-locale';
import { useI18n } from '@/modules/i18n/i18n.provider';
import { useConfirmModal } from '@/modules/shared/confirm';
import { PaginationControls } from '@/modules/shared/pagination/pagination-controls.component';
import { createParamSynchronizedPagination } from '@/modules/shared/pagination/query-synchronized-pagination';
import { cn } from '@/modules/shared/style/cn';
import { Badge } from '@/modules/ui/components/badge';
import { Button } from '@/modules/ui/components/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/modules/ui/components/select';
import { createToast } from '@/modules/ui/components/sonner';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/modules/ui/components/table';
import { fromIsoDate, getActiveFilter, getSelectedFilterValues, isDateRangeValue, resolveDatePreset } from '@/modules/ui/components/table-filters';
import { TableToolbar } from '@/modules/ui/components/table-toolbar';
import { TextField } from '@/modules/ui/components/textfield';
import { AddBankConnectionDialog } from '../components/add-bank-connection-dialog.component';
import { EditBankConnectionDialog } from '../components/edit-bank-connection-dialog.component';
import { TransactionDetailDialog } from '../components/transaction-detail-dialog.component';
import { classificationLabelKeys, transactionClassifications } from '../finances-labels';
import { deleteBankConnection, fetchBankConnections, fetchSubscriptions, fetchTransactions, syncBankConnection, updateTransactionClassification } from '../finances.services';
import { privacyCurrency, privacyText, usePrivacyMode } from '../privacy-mode';

const classificationColors: Record<string, string> = {
  expense: 'bg-red-500/10 text-red-600 border-red-500/20',
  income: 'bg-green-500/10 text-green-600 border-green-500/20',
  owner_transfer: 'bg-blue-500/10 text-blue-600 border-blue-500/20',
  internal_transfer: 'bg-purple-500/10 text-purple-600 border-purple-500/20',
};

const providerIcons: Record<string, string> = {
  mercury: 'i-tabler-building-bank',
  wise: 'i-tabler-world',
};

const amountFilterLabelKeys = [
  { value: 'positive', labelKey: 'finances.amount-filter.positive' },
  { value: 'negative', labelKey: 'finances.amount-filter.negative' },
  { value: 'gt', labelKey: 'finances.amount-filter.gt' },
  { value: 'lt', labelKey: 'finances.amount-filter.lt' },
  { value: 'gte', labelKey: 'finances.amount-filter.gte' },
  { value: 'lte', labelKey: 'finances.amount-filter.lte' },
  { value: 'eq', labelKey: 'finances.amount-filter.eq' },
] as const satisfies ReadonlyArray<{ value: string; labelKey: TranslationKeys }>;

// Amount comparisons that need a number next to them
const AMOUNT_COMPARISONS = ['gt', 'lt', 'gte', 'lte', 'eq'];

const DATE_PRESETS: DateRangePreset[] = ['today', 'this_week', 'this_month', 'last_month', 'last_30', 'this_year', 'last_year'];

const getDefaultFilters = (): ActiveFilter[] => [{ fieldId: 'date', value: resolveDatePreset('last_30') }];

type StoredFilters = { filters: ActiveFilter[]; amountValue?: number };

const getFiltersStorageKey = (organizationId: string) => `papra:finances:filters:v2:${organizationId}`;

function readFiltersFromStorage(organizationId: string): StoredFilters | null {
  try {
    const raw = localStorage.getItem(getFiltersStorageKey(organizationId));
    if (!raw) {
      return null;
    }
    const stored = JSON.parse(raw) as StoredFilters;
    // A relative period ("last 30 days") is resolved again, it is not frozen at the day it was saved
    return { ...stored, filters: stored.filters.map(filter => (isDateRangeValue(filter.value) && filter.value.preset ? { ...filter, value: resolveDatePreset(filter.value.preset) } : filter)) };
  } catch {
    return null;
  }
}

function writeFiltersToStorage(organizationId: string, stored: StoredFilters): void {
  try {
    localStorage.setItem(getFiltersStorageKey(organizationId), JSON.stringify(stored));
  } catch {}
}

// The API takes timestamps: from the start of the first day to the end of the last one
function toTimestampRange(range: DateRangeValue | undefined): { from?: number; to?: number } {
  if (!range) {
    return {};
  }
  const to = fromIsoDate(range.to);
  return { from: fromIsoDate(range.from).getTime(), to: new Date(to.getFullYear(), to.getMonth(), to.getDate(), 23, 59, 59, 999).getTime() };
}

function formatCurrencyRaw(amount: number, currency: string) {
  return new Intl.NumberFormat(getDocumentLocale(), {
    style: 'currency',
    currency,
    minimumFractionDigits: 2,
  }).format(amount);
}

function formatDate(date: Date | string) {
  return new Intl.DateTimeFormat(getDocumentLocale(), {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  }).format(new Date(date));
}

export const FinancesPage: Component = () => {
  const { t } = useI18n();
  const classificationOptions = () => transactionClassifications.map(value => ({ value, label: t(classificationLabelKeys[value]) }));
  const amountFilterOptions = () => amountFilterLabelKeys.map(option => ({ value: option.value, label: t(option.labelKey) }));
  const params = useParams();
  const queryClient = useQueryClient();
  const { confirm } = useConfirmModal();
  const { isPrivacyMode, togglePrivacyMode } = usePrivacyMode();
  const formatCurrency = (amount: number, currency: string) => privacyCurrency(formatCurrencyRaw(amount, currency), isPrivacyMode());
  const [getPagination, setPagination] = createParamSynchronizedPagination();
  const resetPagination = () => setPagination({ pageIndex: 0, pageSize: getPagination().pageSize });

  const stored = readFiltersFromStorage(params.organizationId);
  const [getFilters, setFiltersValue] = createSignal<ActiveFilter[]>(stored?.filters ?? getDefaultFilters());
  const [getAmountValue, setAmountValue] = createSignal<number | undefined>(stored?.amountValue);
  const [getSearchQuery, setSearchQuery] = createSignal('');
  const [getDebouncedSearch, setDebouncedSearch] = createSignal<string | undefined>();

  const getSelected = (fieldId: string) => getSelectedFilterValues(getFilters(), fieldId)[0];
  const getFilterConnection = () => getSelected('account');
  const getFilterClassification = () => getSelected('type');
  const getAmountFilter = () => getSelected('amount');
  const needsAmountValue = () => AMOUNT_COMPARISONS.includes(getAmountFilter() ?? '');

  const setFilters = (filters: ActiveFilter[]) => {
    setFiltersValue(filters);
    if (!needsAmountValue()) {
      setAmountValue(undefined);
    }
    resetPagination();
  };

  createEffect(() => {
    writeFiltersToStorage(params.organizationId, { filters: getFilters(), amountValue: getAmountValue() });
  });

  const hasActiveFilters = () => getFilters().length > 0 || !!getDebouncedSearch();

  const clearFilters = () => {
    setFiltersValue(getDefaultFilters());
    setAmountValue(undefined);
    setSearchQuery('');
    setDebouncedSearch(undefined);
    resetPagination();
  };

  const dateRange = createMemo(() => {
    const value = getActiveFilter(getFilters(), 'date')?.value;
    return toTimestampRange(isDateRangeValue(value) ? value : undefined);
  });
  const [getEditingConnection, setEditingConnection] = createSignal<string | undefined>();
  const [getDetailTransaction, setDetailTransaction] = createSignal<Transaction | null>(null);

  let searchDebounceTimer: ReturnType<typeof setTimeout> | undefined;
  const handleSearchInput = (value: string) => {
    setSearchQuery(value);
    clearTimeout(searchDebounceTimer);
    searchDebounceTimer = setTimeout(() => {
      setDebouncedSearch(value.trim() || undefined);
      setPagination({ pageIndex: 0, pageSize: getPagination().pageSize });
    }, 300);
  };

  const subscriptionsQuery = useQuery(() => ({
    queryKey: ['organizations', params.organizationId, 'finances', 'subscriptions'],
    queryFn: () => fetchSubscriptions({ organizationId: params.organizationId }),
  }));

  const matchSubscriptions = (transaction: Transaction) => {
    const subs = subscriptionsQuery.data?.subscriptions ?? [];
    return subs.filter((s) => {
      if (!s.transactionSearchQuery?.trim()) {
        return false;
      }
      const q = s.transactionSearchQuery.trim().toLowerCase();
      return transaction.description?.toLowerCase().includes(q)
        || transaction.counterparty?.toLowerCase().includes(q);
    });
  };

  const connectionsQuery = useQuery(() => ({
    queryKey: ['organizations', params.organizationId, 'finances', 'bank-connections'],
    queryFn: () => fetchBankConnections({ organizationId: params.organizationId }),
  }));

  const filterFields = createMemo((): FilterField[] => [
    { id: 'account', type: 'select', label: t('finances.filters.account'), icon: 'i-tabler-building-bank', options: (connectionsQuery.data?.bankConnections ?? []).map(connection => ({ value: connection.id, label: connection.name })) },
    { id: 'type', type: 'select', label: t('finances.filters.type'), icon: 'i-tabler-category', options: classificationOptions() },
    { id: 'amount', type: 'select', label: t('finances.filters.amount'), icon: 'i-tabler-coin', options: amountFilterOptions() },
    { id: 'date', type: 'date-range', label: t('finances.filters.date'), icon: 'i-tabler-calendar', presets: DATE_PRESETS },
  ]);

  const transactionsQuery = useQuery(() => ({
    queryKey: ['organizations', params.organizationId, 'finances', 'transactions', getPagination(), getFilterConnection(), getFilterClassification(), getDebouncedSearch(), getAmountFilter(), getAmountValue(), dateRange()],
    queryFn: () => fetchTransactions({
      organizationId: params.organizationId,
      ...getPagination(),
      bankConnectionId: getFilterConnection(),
      classification: getFilterClassification(),
      search: getDebouncedSearch(),
      amountFilter: getAmountFilter(),
      amountValue: getAmountValue(),
      dateFrom: dateRange().from,
      dateTo: dateRange().to,
    }),
    placeholderData: keepPreviousData,
  }));

  const syncMutation = createMutation(() => ({
    mutationFn: ({ bankConnectionId, fullSync }: { bankConnectionId: string; fullSync?: boolean }) => syncBankConnection({
      organizationId: params.organizationId,
      bankConnectionId,
      fullSync,
    }),
    onSuccess: (data) => {
      createToast({ message: t('finances.transactions.toast.synced', { count: data.insertedCount }), type: 'success' });
      queryClient.invalidateQueries({ queryKey: ['organizations', params.organizationId, 'finances'] });
    },
    onError: () => {
      createToast({ message: t('finances.transactions.toast.sync-error'), type: 'error' });
    },
  }));

  const deleteMutation = createMutation(() => ({
    mutationFn: (bankConnectionId: string) => deleteBankConnection({
      organizationId: params.organizationId,
      bankConnectionId,
    }),
    onSuccess: () => {
      createToast({ message: t('finances.bank-connection.toast.deleted'), type: 'success' });
      queryClient.invalidateQueries({ queryKey: ['organizations', params.organizationId, 'finances'] });
    },
    onError: () => {
      createToast({ message: t('finances.bank-connection.toast.delete-error'), type: 'error' });
    },
  }));

  const classifyMutation = createMutation(() => ({
    mutationFn: ({ transactionId, classification }: { transactionId: string; classification: string | null }) =>
      updateTransactionClassification({
        organizationId: params.organizationId,
        transactionId,
        classification,
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['organizations', params.organizationId, 'finances', 'transactions'] });
    },
  }));

  return (
    <div class="page">
      {/* Header */}
      <div class="page-header">
        <div>
          <h1 class="page-title">{t('finances.transactions.title')}</h1>
          <p class="page-description">{t('finances.transactions.description')}</p>
        </div>
        <div class="flex items-center gap-2">
          <Button variant="ghost" size="sm" onClick={togglePrivacyMode} title={isPrivacyMode() ? t('finances.privacy.show') : t('finances.privacy.hide')}>
            <div class={cn(isPrivacyMode() ? 'i-tabler-eye-off' : 'i-tabler-eye', 'size-4')} />
          </Button>
          <Show when={(connectionsQuery.data?.bankConnections?.length ?? 0) > 0}>
            <AddBankConnectionDialog organizationId={params.organizationId} />
          </Show>
        </div>
      </div>

      <div>

        {/* Bank connections */}
        <Show when={(connectionsQuery.data?.bankConnections?.length ?? 0) > 0}>
          <div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 mb-6">
            <For each={connectionsQuery.data?.bankConnections}>
              {connection => (
                <div class="border rounded-lg p-4 flex items-center gap-3">
                  <div class={cn(providerIcons[connection.provider] ?? 'i-tabler-building-bank', 'size-8 text-primary opacity-60')} />
                  <div class="flex-1 min-w-0">
                    <div class="font-medium truncate">{connection.name}</div>
                    <div class="text-xs text-muted-foreground capitalize">{connection.provider}</div>
                  </div>
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() => setEditingConnection(connection.id)}
                    aria-label={t('finances.bank-connection.edit')}
                  >
                    <div class="i-tabler-pencil size-4" />
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => syncMutation.mutate({ bankConnectionId: connection.id })}
                    disabled={syncMutation.isPending}
                    title={t('finances.bank-connection.sync')}
                  >
                    <div class={cn('i-tabler-refresh size-4', syncMutation.isPending && 'animate-spin')} />
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => syncMutation.mutate({ bankConnectionId: connection.id, fullSync: true })}
                    disabled={syncMutation.isPending}
                    title={t('finances.bank-connection.full-sync')}
                  >
                    <div class={cn('i-tabler-cloud-download size-4', syncMutation.isPending && 'animate-spin')} />
                  </Button>
                  <Button
                    size="sm"
                    variant="ghost"
                    class="text-destructive hover:text-destructive"
                    onClick={async () => {
                      const ok = await confirm({
                        title: t('finances.bank-connection.delete.title'),
                        message: t('finances.bank-connection.delete.message', { name: connection.name }),
                        confirmButton: { text: t('finances.common.delete'), variant: 'destructive' },
                      });
                      if (ok) {
                        deleteMutation.mutate(connection.id);
                      }
                    }}
                    disabled={deleteMutation.isPending}
                  >
                    <div class="i-tabler-trash size-4" />
                  </Button>
                </div>
              )}
            </For>
          </div>
        </Show>

        <Show when={getEditingConnection() !== undefined}>
          {(_) => {
            const conn = () => connectionsQuery.data?.bankConnections?.find(c => c.id === getEditingConnection());
            return (
              <Show when={conn()}>
                {c => (
                  <EditBankConnectionDialog
                    organizationId={params.organizationId}
                    bankConnectionId={c().id}
                    initialName={c().name}
                    initialAccountId={c().providerAccountId}
                    provider={c().provider}
                    isOpen={true}
                    onClose={() => setEditingConnection(undefined)}
                  />
                )}
              </Show>
            );
          }}
        </Show>

        <Show when={(connectionsQuery.data?.bankConnections?.length ?? 0) > 0}>
          <TableToolbar
            search={getSearchQuery()}
            onSearchChange={handleSearchInput}
            searchPlaceholder={t('finances.filters.search')}
            searchLoading={transactionsQuery.isFetching && getSearchQuery().length > 0}
            fields={filterFields()}
            filters={getFilters()}
            onFiltersChange={setFilters}
            actions={(
              <Show when={needsAmountValue()}>
                <TextField
                  type="number"
                  class="h-8 w-32"
                  placeholder={t('finances.filters.amount')}
                  aria-label={t('finances.filters.amount')}
                  value={getAmountValue()?.toString() ?? ''}
                  onInput={(event) => {
                    const value = event.currentTarget.value;
                    setAmountValue(value ? Number(value) : undefined);
                    resetPagination();
                  }}
                />
              </Show>
            )}
          />
        </Show>

        {/* Total amount summary */}
        <Show when={transactionsQuery.data && (transactionsQuery.data.transactions?.length ?? 0) > 0}>
          <div class="flex items-center gap-3 mb-4 text-sm text-muted-foreground">
            <span>
              {t('finances.transactions.count', { count: (transactionsQuery.data?.transactionsCount ?? 0).toLocaleString(getDocumentLocale()) })}
            </span>
            <span class="text-border">·</span>
            <span class="flex items-center gap-1.5">
              {t('finances.transactions.total')}
              {' '}
              <Show
                when={transactionsQuery.data?.totalAmountEur != null}
                fallback={(
                  <span class={cn('font-mono font-medium', (transactionsQuery.data?.totalAmount ?? 0) < 0 ? 'text-red-500' : 'text-green-600')}>
                    {formatCurrency(transactionsQuery.data?.totalAmount ?? 0, 'USD')}
                  </span>
                )}
              >
                <span class={cn('font-mono font-medium', (transactionsQuery.data?.totalAmountEur ?? 0) < 0 ? 'text-red-500' : 'text-green-600')}>
                  {formatCurrency(transactionsQuery.data?.totalAmountEur ?? 0, 'EUR')}
                </span>
                <span class="text-xs text-muted-foreground/60 font-mono">
                  (
                  {formatCurrency(transactionsQuery.data?.totalAmountUsd ?? transactionsQuery.data?.totalAmount ?? 0, 'USD')}
                  )
                </span>
              </Show>
            </span>
          </div>
        </Show>

        {/* Transactions table */}
        <Show
          when={(transactionsQuery.data?.transactions?.length ?? 0) > 0}
          fallback={(
            <Switch>
              <Match when={(connectionsQuery.data?.bankConnections?.length ?? 0) === 0}>
                <div class="text-center py-16">
                  <div class="i-tabler-building-bank size-12 mx-auto text-muted-foreground opacity-40 mb-4" />
                  <h3 class="text-lg font-medium mb-1">{t('finances.transactions.empty.no-accounts.title')}</h3>
                  <p class="text-muted-foreground text-sm mb-4">{t('finances.transactions.empty.no-accounts.description')}</p>
                  <AddBankConnectionDialog organizationId={params.organizationId} />
                </div>
              </Match>
              <Match when={!transactionsQuery.isFetching}>
                <div class="text-center py-16">
                  <div class="i-tabler-filter-off size-12 mx-auto text-muted-foreground opacity-40 mb-4" />
                  <h3 class="text-lg font-medium mb-1">{t('finances.transactions.empty.no-results.title')}</h3>
                  <p class="text-muted-foreground text-sm mb-4">{t('finances.transactions.empty.no-results.description')}</p>
                  <Show when={hasActiveFilters()}>
                    <Button variant="outline" onClick={clearFilters}>
                      <div class="i-tabler-x size-4 mr-1.5" />
                      {t('finances.filters.clear-all')}
                    </Button>
                  </Show>
                </div>
              </Match>
            </Switch>
          )}
        >
          <div class="border rounded-lg">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead class="w-8" />
                  <TableHead>{t('finances.transactions.table.date')}</TableHead>
                  <TableHead>{t('finances.transactions.table.description')}</TableHead>
                  <TableHead>{t('finances.transactions.table.counterparty')}</TableHead>
                  <TableHead class="text-right">{t('finances.transactions.table.amount')}</TableHead>
                  <TableHead>{t('finances.transactions.table.account')}</TableHead>
                  <TableHead>{t('finances.transactions.table.tags')}</TableHead>
                  <TableHead>{t('finances.transactions.table.subscription')}</TableHead>
                  <TableHead>{t('finances.transactions.table.classification')}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                <For each={transactionsQuery.data?.transactions}>
                  {transaction => (
                    <TableRow>
                      <TableCell class="px-2">
                        <Button
                          size="sm"
                          variant="ghost"
                          class="size-7 p-0"
                          onClick={() => setDetailTransaction(transaction)}
                          aria-label={t('finances.transactions.view-details')}
                        >
                          <div class="i-tabler-eye size-4 text-muted-foreground" />
                        </Button>
                      </TableCell>
                      <TableCell class="text-muted-foreground whitespace-nowrap">
                        {formatDate(transaction.date)}
                      </TableCell>
                      <TableCell class="max-w-[300px] truncate" title={isPrivacyMode() ? '' : transaction.description}>
                        {privacyText(transaction.description, isPrivacyMode())}
                      </TableCell>
                      <TableCell class="text-muted-foreground">
                        {privacyText(transaction.counterparty ?? '—', isPrivacyMode())}
                      </TableCell>
                      <TableCell class={cn('text-right font-mono whitespace-nowrap', transaction.amount < 0 ? 'text-red-500' : 'text-green-600')}>
                        {formatCurrency(transaction.amount, transaction.currency)}
                      </TableCell>
                      <TableCell>
                        <Badge variant="outline" class="text-xs capitalize">
                          <div class={cn(providerIcons[transaction.provider] ?? 'i-tabler-building-bank', 'size-3 mr-1')} />
                          {transaction.provider}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        <div class="flex flex-wrap gap-1">
                          <For each={transaction.tags ?? []}>
                            {tag => (
                              <Badge variant="outline" class="text-xs">
                                <div class="size-2 rounded-full mr-1" style={{ background: tag.color ?? '#888' }} />
                                {tag.name}
                              </Badge>
                            )}
                          </For>
                        </div>
                      </TableCell>
                      <TableCell>
                        <div class="flex flex-wrap gap-1">
                          <For each={matchSubscriptions(transaction)}>
                            {sub => (
                              <Badge variant="outline" class="text-xs bg-violet-500/10 text-violet-600 border-violet-500/20">
                                <div class="i-tabler-repeat size-3 mr-1" />
                                {sub.name}
                              </Badge>
                            )}
                          </For>
                        </div>
                      </TableCell>
                      <TableCell>
                        <Select
                          options={[
                            { value: null as string | null, label: t('finances.classification.unclassified') },
                            ...classificationOptions().map(c => ({ value: c.value as string | null, label: c.label })),
                          ]}
                          optionValue="value"
                          optionTextValue="label"
                          value={
                            transaction.classification
                              ? classificationOptions().map(c => ({ value: c.value as string | null, label: c.label })).find(c => c.value === transaction.classification)
                              : { value: null, label: t('finances.classification.unclassified') }
                          }
                          onChange={(v) => {
                            if (v) {
                              classifyMutation.mutate({
                                transactionId: transaction.id,
                                classification: v.value,
                              });
                            }
                          }}
                          itemComponent={prps => (
                            <SelectItem item={prps.item}>
                              <span class={classificationColors[prps.item.rawValue.value ?? ''] ? 'font-medium' : 'text-muted-foreground'}>
                                {prps.item.rawValue.label}
                              </span>
                            </SelectItem>
                          )}
                        >
                          <SelectTrigger
                            class={cn('w-40 h-7 text-xs', classificationColors[transaction.classification ?? ''])}
                            caretIcon={<div class="i-tabler-chevron-down size-3 opacity-50" />}
                          >
                            <SelectValue<{ value: string | null; label: string }>>
                              {state => state.selectedOption()?.label ?? t('finances.classification.unclassified')}
                            </SelectValue>
                          </SelectTrigger>
                          <SelectContent />
                        </Select>
                      </TableCell>
                    </TableRow>
                  )}
                </For>
              </TableBody>
            </Table>
          </div>

          <PaginationControls
            getPagination={getPagination}
            setPagination={setPagination}
            totalCount={transactionsQuery.data?.transactionsCount ?? 0}
          />
        </Show>

        <TransactionDetailDialog
          transaction={getDetailTransaction()}
          isOpen={getDetailTransaction() !== null}
          onClose={() => setDetailTransaction(null)}
          organizationId={params.organizationId}
        />
      </div>
    </div>
  );
};
