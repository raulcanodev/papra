import type { Component } from 'solid-js';
import type { Transaction } from '../finances.types';
import type { TranslationKeys } from '@/modules/i18n/locales.types';
import Calendar from '@corvu/calendar';
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
import { CalendarGrid } from '@/modules/ui/components/calendar';
import { CalendarMonthYearHeader } from '@/modules/ui/components/calendar-month-year-header';
import { Popover, PopoverContent, PopoverTrigger } from '@/modules/ui/components/popover';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/modules/ui/components/select';
import { createToast } from '@/modules/ui/components/sonner';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/modules/ui/components/table';
import { TextField, TextFieldRoot } from '@/modules/ui/components/textfield';
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
  { value: undefined as string | undefined, labelKey: 'finances.amount-filter.any' },
  { value: 'positive' as string | undefined, labelKey: 'finances.amount-filter.positive' },
  { value: 'negative' as string | undefined, labelKey: 'finances.amount-filter.negative' },
  { value: 'gt' as string | undefined, labelKey: 'finances.amount-filter.gt' },
  { value: 'lt' as string | undefined, labelKey: 'finances.amount-filter.lt' },
  { value: 'gte' as string | undefined, labelKey: 'finances.amount-filter.gte' },
  { value: 'lte' as string | undefined, labelKey: 'finances.amount-filter.lte' },
  { value: 'eq' as string | undefined, labelKey: 'finances.amount-filter.eq' },
] as const satisfies ReadonlyArray<{ value: string | undefined; labelKey: TranslationKeys }>;

type DatePreset = 'last-7' | 'last-week' | 'last-weekend' | 'last-30' | 'this-month' | 'last-month' | 'this-year' | 'all' | 'custom';
const datePresets: DatePreset[] = ['all', 'last-7', 'last-week', 'last-weekend', 'last-30', 'this-month', 'last-month', 'this-year', 'custom'];
const datePresetLabelKeys = {
  'all': 'finances.date-preset.all',
  'last-7': 'finances.date-preset.last-7',
  'last-week': 'finances.date-preset.last-week',
  'last-weekend': 'finances.date-preset.last-weekend',
  'last-30': 'finances.date-preset.last-30',
  'this-month': 'finances.date-preset.this-month',
  'last-month': 'finances.date-preset.last-month',
  'this-year': 'finances.date-preset.this-year',
  'custom': 'finances.date-preset.custom',
} as const satisfies Record<DatePreset, TranslationKeys>;

type FilterStorage = {
  filterConnection?: string;
  filterClassification?: string;
  amountFilter?: string;
  amountValue?: number;
  datePreset: DatePreset;
  customFrom?: string | null;
  customTo?: string | null;
};

function readFiltersFromStorage(orgId: string): FilterStorage | null {
  try {
    const raw = localStorage.getItem(`papra:finances:filters:${orgId}`);
    return raw ? (JSON.parse(raw) as FilterStorage) : null;
  } catch {
    return null;
  }
}

function writeFiltersToStorage(orgId: string, f: FilterStorage): void {
  try {
    localStorage.setItem(`papra:finances:filters:${orgId}`, JSON.stringify(f));
  } catch {}
}

function getDateRange(preset: DatePreset): { from?: number; to?: number } {
  const now = new Date();
  const startOfDay = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
  const endOfDay = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate(), 23, 59, 59, 999).getTime();

  switch (preset) {
    case 'last-7': return { from: startOfDay(new Date(now.getTime() - 7 * 86400000)), to: endOfDay(now) };
    case 'last-week': {
      const day = now.getDay(); // 0=Sun
      const lastMon = new Date(now.getFullYear(), now.getMonth(), now.getDate() - day - 6);
      const lastSun = new Date(lastMon.getFullYear(), lastMon.getMonth(), lastMon.getDate() + 6);
      return { from: startOfDay(lastMon), to: endOfDay(lastSun) };
    }
    case 'last-weekend': {
      const d = now.getDay();
      const lastSat = new Date(now.getFullYear(), now.getMonth(), now.getDate() - d - 1);
      const lastSun = new Date(lastSat.getFullYear(), lastSat.getMonth(), lastSat.getDate() + 1);
      return { from: startOfDay(lastSat), to: endOfDay(lastSun) };
    }
    case 'last-30': return { from: startOfDay(new Date(now.getTime() - 30 * 86400000)), to: endOfDay(now) };
    case 'this-month': return { from: startOfDay(new Date(now.getFullYear(), now.getMonth(), 1)), to: endOfDay(now) };
    case 'last-month': {
      const first = new Date(now.getFullYear(), now.getMonth() - 1, 1);
      const last = new Date(now.getFullYear(), now.getMonth(), 0);
      return { from: startOfDay(first), to: endOfDay(last) };
    }
    case 'this-year': return { from: startOfDay(new Date(now.getFullYear(), 0, 1)), to: endOfDay(now) };
    case 'all': return {};
    case 'custom': return {};
  }
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
  const datePresetOptions = () => datePresets.map(value => ({ value, label: t(datePresetLabelKeys[value]) }));
  const params = useParams();
  const queryClient = useQueryClient();
  const { confirm } = useConfirmModal();
  const { isPrivacyMode, togglePrivacyMode } = usePrivacyMode();
  const formatCurrency = (amount: number, currency: string) => privacyCurrency(formatCurrencyRaw(amount, currency), isPrivacyMode());
  const [getPagination, setPagination] = createParamSynchronizedPagination();

  const stored = readFiltersFromStorage(params.organizationId);
  const [getFilterConnection, setFilterConnection] = createSignal<string | undefined>(stored?.filterConnection);
  const [getFilterClassification, setFilterClassification] = createSignal<string | undefined>(stored?.filterClassification);
  const [getSearchQuery, setSearchQuery] = createSignal('');
  const [getDebouncedSearch, setDebouncedSearch] = createSignal<string | undefined>();
  const [getAmountFilter, setAmountFilter] = createSignal<string | undefined>(stored?.amountFilter);
  const [getAmountValue, setAmountValue] = createSignal<number | undefined>(stored?.amountValue);
  const [getDatePreset, setDatePreset] = createSignal<DatePreset>(stored?.datePreset ?? 'last-30');
  const [getCustomFrom, setCustomFrom] = createSignal<Date | null>(stored?.customFrom ? new Date(stored.customFrom) : null);
  const [getCustomTo, setCustomTo] = createSignal<Date | null>(stored?.customTo ? new Date(stored.customTo) : null);
  const [isDatePopoverOpen, setIsDatePopoverOpen] = createSignal(false);

  createEffect(() => {
    writeFiltersToStorage(params.organizationId, {
      filterConnection: getFilterConnection(),
      filterClassification: getFilterClassification(),
      amountFilter: getAmountFilter(),
      amountValue: getAmountValue(),
      datePreset: getDatePreset(),
      customFrom: getCustomFrom()?.toISOString() ?? null,
      customTo: getCustomTo()?.toISOString() ?? null,
    });
  });

  const hasActiveFilters = () =>
    getFilterConnection() != null
    || getFilterClassification() != null
    || getAmountFilter() != null
    || getDatePreset() !== 'all'
    || !!getDebouncedSearch();

  const clearFilters = () => {
    setFilterConnection(undefined);
    setFilterClassification(undefined);
    setAmountFilter(undefined);
    setAmountValue(undefined);
    setDatePreset('last-30');
    setCustomFrom(null);
    setCustomTo(null);
    setSearchQuery('');
    setDebouncedSearch(undefined);
    setPagination({ pageIndex: 0, pageSize: getPagination().pageSize });
  };

  const dateRange = createMemo(() => {
    const preset = getDatePreset();
    if (preset === 'custom') {
      const from = getCustomFrom();
      const to = getCustomTo();
      return {
        from: from ? new Date(from.getFullYear(), from.getMonth(), from.getDate()).getTime() : undefined,
        to: to ? new Date(to.getFullYear(), to.getMonth(), to.getDate(), 23, 59, 59, 999).getTime() : undefined,
      };
    }
    return getDateRange(preset);
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

  const allAccountsOption = () => ({ value: undefined as string | undefined, label: t('finances.filters.all-accounts') });
  const allTypesOption = () => ({ value: undefined as string | undefined, label: t('finances.filters.all-types') });

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

        {/* Filters */}
        <Show when={(connectionsQuery.data?.bankConnections?.length ?? 0) > 0}>
          <div class="flex gap-3 mb-4 flex-wrap items-end">
            {/* Search */}
            <TextFieldRoot class="w-56">
              <TextField
                placeholder={t('finances.filters.search')}
                value={getSearchQuery()}
                onInput={e => handleSearchInput(e.currentTarget.value)}
              />
            </TextFieldRoot>

            <Select
              options={[allAccountsOption(), ...(connectionsQuery.data?.bankConnections ?? []).map(c => ({ value: c.id as string | undefined, label: c.name }))]}
              optionValue="value"
              optionTextValue="label"
              value={getFilterConnection()
                ? { value: getFilterConnection(), label: connectionsQuery.data?.bankConnections?.find(c => c.id === getFilterConnection())?.name ?? '' }
                : allAccountsOption()}
              onChange={v => setFilterConnection(v?.value)}
              itemComponent={prps => <SelectItem item={prps.item}>{prps.item.rawValue.label}</SelectItem>}
            >
              <SelectTrigger class="w-44">
                <SelectValue<{ value: string | undefined; label: string }>>{state => state.selectedOption()?.label ?? t('finances.filters.all-accounts')}</SelectValue>
              </SelectTrigger>
              <SelectContent />
            </Select>

            <Select
              options={[allTypesOption(), ...classificationOptions().map(c => ({ value: c.value as string | undefined, label: c.label }))]}
              optionValue="value"
              optionTextValue="label"
              value={getFilterClassification()
                ? { value: getFilterClassification(), label: classificationOptions().find(c => c.value === getFilterClassification())?.label ?? '' }
                : allTypesOption()}
              onChange={v => setFilterClassification(v?.value)}
              itemComponent={prps => <SelectItem item={prps.item}>{prps.item.rawValue.label}</SelectItem>}
            >
              <SelectTrigger class="w-40">
                <SelectValue<{ value: string | undefined; label: string }>>{state => state.selectedOption()?.label ?? t('finances.filters.all-types')}</SelectValue>
              </SelectTrigger>
              <SelectContent />
            </Select>

            {/* Amount filter */}
            <Select
              options={amountFilterOptions()}
              optionValue="value"
              optionTextValue="label"
              value={amountFilterOptions().find(o => o.value === getAmountFilter()) ?? amountFilterOptions()[0]}
              onChange={(v) => {
                const val = v?.value;
                setAmountFilter(val);
                if (val === 'positive' || val === 'negative' || !val) {
                  setAmountValue(undefined);
                }
                setPagination({ pageIndex: 0, pageSize: getPagination().pageSize });
              }}
              itemComponent={prps => <SelectItem item={prps.item}>{prps.item.rawValue.label}</SelectItem>}
            >
              <SelectTrigger class="w-44">
                <SelectValue<{ value: string | undefined; label: string }>>{state => state.selectedOption()?.label ?? t('finances.amount-filter.any')}</SelectValue>
              </SelectTrigger>
              <SelectContent />
            </Select>

            <Show when={getAmountFilter() && getAmountFilter() !== 'positive' && getAmountFilter() !== 'negative'}>
              <TextFieldRoot class="w-32">
                <TextField
                  type="number"
                  placeholder={t('finances.filters.amount')}
                  value={getAmountValue()?.toString() ?? ''}
                  onInput={(e) => {
                    const v = e.currentTarget.value;
                    setAmountValue(v ? Number(v) : undefined);
                    setPagination({ pageIndex: 0, pageSize: getPagination().pageSize });
                  }}
                />
              </TextFieldRoot>
            </Show>

            {/* Date filter */}
            <Popover open={isDatePopoverOpen()} onOpenChange={setIsDatePopoverOpen}>
              <PopoverTrigger
                as={Button}
                variant="outline"
                class="h-9 text-xs gap-1.5 font-normal px-3"
              >
                <div class="i-tabler-calendar size-3.5 shrink-0 text-muted-foreground" />
                <Show
                  when={getDatePreset() === 'custom' && (getCustomFrom() || getCustomTo())}
                  fallback={<span>{t(datePresetLabelKeys[getDatePreset()])}</span>}
                >
                  <span>
                    {getCustomFrom() ? formatDate(getCustomFrom()!) : '...'}
                    {' → '}
                    {getCustomTo() ? formatDate(getCustomTo()!) : '...'}
                  </span>
                </Show>
                <div class="i-tabler-chevron-down size-3 opacity-50" />
              </PopoverTrigger>
              <PopoverContent class="w-auto p-0">
                <div class="flex">
                  {/* Preset list */}
                  <div class="flex flex-col border-r min-w-[140px] py-1">
                    <For each={datePresetOptions().filter(o => o.value !== 'custom')}>
                      {option => (
                        <button
                          type="button"
                          class={cn(
                            'text-left px-3 py-1.5 text-xs hover:bg-accent transition-colors',
                            getDatePreset() === option.value ? 'bg-accent font-medium' : 'text-muted-foreground',
                          )}
                          onClick={() => {
                            setDatePreset(option.value);
                            setCustomFrom(null);
                            setCustomTo(null);
                            setPagination({ pageIndex: 0, pageSize: getPagination().pageSize });
                            setIsDatePopoverOpen(false);
                          }}
                        >
                          {option.label}
                        </button>
                      )}
                    </For>
                    <div class="border-t my-1" />
                    <button
                      type="button"
                      class={cn(
                        'text-left px-3 py-1.5 text-xs hover:bg-accent transition-colors',
                        getDatePreset() === 'custom' ? 'bg-accent font-medium' : 'text-muted-foreground',
                      )}
                      onClick={() => setDatePreset('custom')}
                    >
                      {t('finances.date-preset.custom')}
                    </button>
                  </div>

                  {/* Calendar pickers — shown when custom */}
                  <Show when={getDatePreset() === 'custom'}>
                    <div class="p-3">
                      <div class="flex gap-4">
                        <div class="flex flex-col gap-1">
                          <p class="text-xs font-medium text-muted-foreground mb-1">{t('finances.filters.from')}</p>
                          <Calendar
                            mode="single"
                            value={getCustomFrom()}
                            onValueChange={(date) => {
                              setCustomFrom(date);
                              if (date && getCustomTo() && date.getTime() > getCustomTo()!.getTime()) {
                                setCustomTo(null);
                              }
                              setPagination({ pageIndex: 0, pageSize: getPagination().pageSize });
                            }}
                            fixedWeeks
                          >
                            {() => (
                              <div class="flex flex-col gap-2">
                                <CalendarMonthYearHeader />
                                <CalendarGrid />
                              </div>
                            )}
                          </Calendar>
                        </div>
                        <div class="flex flex-col gap-1">
                          <p class="text-xs font-medium text-muted-foreground mb-1">{t('finances.filters.to')}</p>
                          <Calendar
                            mode="single"
                            value={getCustomTo()}
                            onValueChange={(date) => {
                              setCustomTo(date);
                              if (date && getCustomFrom() && date.getTime() < getCustomFrom()!.getTime()) {
                                setCustomFrom(null);
                              }
                              setPagination({ pageIndex: 0, pageSize: getPagination().pageSize });
                            }}
                            fixedWeeks
                          >
                            {() => (
                              <div class="flex flex-col gap-2">
                                <CalendarMonthYearHeader />
                                <CalendarGrid />
                              </div>
                            )}
                          </Calendar>
                        </div>
                      </div>
                      <div class="flex justify-end gap-2 mt-3 pt-3 border-t">
                        <Button
                          variant="ghost"
                          size="sm"
                          class="text-xs"
                          onClick={() => {
                            setCustomFrom(null);
                            setCustomTo(null);
                            setPagination({ pageIndex: 0, pageSize: getPagination().pageSize });
                          }}
                        >
                          {t('finances.filters.clear')}
                        </Button>
                        <Button
                          size="sm"
                          class="text-xs"
                          onClick={() => setIsDatePopoverOpen(false)}
                        >
                          {t('finances.filters.done')}
                        </Button>
                      </div>
                    </div>
                  </Show>
                </div>
              </PopoverContent>
            </Popover>
          </div>
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
