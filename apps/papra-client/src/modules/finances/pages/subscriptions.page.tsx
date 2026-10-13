import type { Component } from 'solid-js';
import type { BillingCycle, Subscription, Transaction } from '../finances.types';
import type { TranslationKeys } from '@/modules/i18n/locales.types';
import type { Tag } from '@/modules/tags/tags.types';
import { useParams } from '@solidjs/router';
import { createMutation, useQuery, useQueryClient } from '@tanstack/solid-query';
import { createMemo, createSignal, For, Show } from 'solid-js';
import { getDocumentLocale } from '@/modules/i18n/document-locale';
import { useI18n } from '@/modules/i18n/i18n.provider';
import { useConfirmModal } from '@/modules/shared/confirm';
import { cn } from '@/modules/shared/style/cn';
import { TagList } from '@/modules/tags/components/tag-list.component';
import { Button } from '@/modules/ui/components/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/modules/ui/components/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/modules/ui/components/select';
import { createToast } from '@/modules/ui/components/sonner';
import { TextField, TextFieldRoot } from '@/modules/ui/components/textfield';
import { createSubscription, deleteSubscription, fetchSubscriptions, fetchTransactions, updateSubscription } from '../finances.services';

const billingCycleLabelKeys = {
  weekly: 'finances.billing-cycle.weekly',
  monthly: 'finances.billing-cycle.monthly',
  quarterly: 'finances.billing-cycle.quarterly',
  yearly: 'finances.billing-cycle.yearly',
} as const satisfies Record<BillingCycle, TranslationKeys>;

const billingCycleShortLabelKeys = {
  weekly: 'finances.billing-cycle.short.weekly',
  monthly: 'finances.billing-cycle.short.monthly',
  quarterly: 'finances.billing-cycle.short.quarterly',
  yearly: 'finances.billing-cycle.short.yearly',
} as const satisfies Record<BillingCycle, TranslationKeys>;

const CATEGORY_OPTIONS = [
  { value: null as string | null, labelKey: 'finances.category.none' },
  { value: 'expense', labelKey: 'finances.category.expense' },
  { value: 'income', labelKey: 'finances.category.income' },
  { value: 'owner_transfer', labelKey: 'finances.category.owner_transfer' },
  { value: 'internal_transfer', labelKey: 'finances.category.internal_transfer' },
] as const satisfies ReadonlyArray<{ value: string | null; labelKey: TranslationKeys }>;

function toMonthlyAmount(amount: number, cycle: BillingCycle): number {
  switch (cycle) {
    case 'weekly': return amount * 52 / 12;
    case 'monthly': return amount;
    case 'quarterly': return amount / 3;
    case 'yearly': return amount / 12;
  }
}

function formatCurrency(amount: number, currency = 'USD') {
  return new Intl.NumberFormat(getDocumentLocale(), { style: 'currency', currency, minimumFractionDigits: 2 }).format(amount);
}

function formatDate(date: Date | string | null) {
  if (!date) {
    return '—';
  }
  return new Intl.DateTimeFormat(getDocumentLocale(), { year: 'numeric', month: 'short', day: 'numeric' }).format(new Date(date));
}

type FormState = {
  name: string;
  amount: string;
  currency: string;
  billingCycle: BillingCycle;
  nextPaymentAt: string;
  category: string | null;
  notes: string;
  transactionSearchQuery: string;
  tagIds: string[];
};

function defaultForm(): FormState {
  return {
    name: '',
    amount: '',
    currency: 'USD',
    billingCycle: 'monthly',
    nextPaymentAt: '',
    category: null,
    notes: '',
    transactionSearchQuery: '',
    tagIds: [],
  };
}

function detectBillingCycle(transactions: Transaction[]): BillingCycle {
  if (transactions.length < 2) {
    return 'monthly';
  }
  const sorted = [...transactions].sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());
  const intervals: number[] = [];
  for (let i = 1; i < sorted.length; i++) {
    intervals.push((new Date(sorted[i]!.date).getTime() - new Date(sorted[i - 1]!.date).getTime()) / 86400000);
  }
  const avg = intervals.reduce((a, b) => a + b, 0) / intervals.length;
  if (avg < 10) {
    return 'weekly';
  }
  if (avg < 50) {
    return 'monthly';
  }
  if (avg < 120) {
    return 'quarterly';
  }
  return 'yearly';
}

function detectMedianAmount(transactions: Transaction[]): number {
  if (!transactions.length) {
    return 0;
  }
  const sorted = transactions.map(t => Math.abs(t.amount)).sort((a, b) => a - b);
  return sorted[Math.floor(sorted.length / 2)]!;
}

function detectCurrency(transactions: Transaction[]): string {
  if (!transactions.length) {
    return 'USD';
  }
  const counts: Record<string, number> = {};
  for (const t of transactions) {
    counts[t.currency] = (counts[t.currency] ?? 0) + 1;
  }
  return Object.entries(counts).sort((a, b) => b[1] - a[1])[0]?.[0] ?? 'USD';
}

function detectNextPayment(transactions: Transaction[], cycle: BillingCycle): Date | null {
  if (!transactions.length) {
    return null;
  }
  const sorted = [...transactions].sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
  const last = new Date(sorted[0]!.date);
  const daysMap: Record<BillingCycle, number> = { weekly: 7, monthly: 30, quarterly: 91, yearly: 365 };
  return new Date(last.getTime() + daysMap[cycle] * 86400000);
}

const SubscriptionFormDialog: Component<{
  isOpen: boolean;
  onClose: () => void;
  onSave: (data: FormState) => void;
  initial?: Subscription;
  isPending: boolean;
  organizationId: string;
}> = (props) => {
  const { t } = useI18n();
  const isEditing = !!props.initial;
  const billingCycles = () => (Object.keys(billingCycleLabelKeys) as BillingCycle[]).map(value => ({ value, label: t(billingCycleLabelKeys[value]) }));
  const categories = () => CATEGORY_OPTIONS.map(option => ({ value: option.value, label: t(option.labelKey) }));

  const getInitialForm = (): FormState => props.initial
    ? {
        name: props.initial.name,
        amount: String(props.initial.amount),
        currency: props.initial.currency,
        billingCycle: props.initial.billingCycle,
        nextPaymentAt: props.initial.nextPaymentAt
          ? new Date(props.initial.nextPaymentAt).toISOString().split('T')[0]!
          : '',
        category: props.initial.category,
        notes: props.initial.notes ?? '',
        transactionSearchQuery: props.initial.transactionSearchQuery ?? '',
        tagIds: props.initial.tagIds ?? [],
      }
    : defaultForm();

  // --- Mode toggle ---
  const [mode, setMode] = createSignal<'smart' | 'manual'>(isEditing ? 'manual' : 'smart');

  // --- Manual mode state ---
  const [form, setForm] = createSignal<FormState>(getInitialForm());
  const set = (key: keyof FormState, value: string | null) =>
    setForm(prev => ({ ...prev, [key]: value }));

  const [manualTags, setManualTags] = createSignal<Tag[]>([]);

  const [debouncedSearch, setDebouncedSearch] = createSignal(getInitialForm().transactionSearchQuery);
  let searchTimer: ReturnType<typeof setTimeout> | undefined;
  const handleSearchInput = (value: string) => {
    set('transactionSearchQuery', value);
    clearTimeout(searchTimer);
    searchTimer = setTimeout(() => setDebouncedSearch(value), 400);
  };

  // --- Smart mode state ---
  const [smartName, setSmartName] = createSignal('');
  const [smartQuery, setSmartQuery] = createSignal('');
  const [smartDebounced, setSmartDebounced] = createSignal('');
  const [smartTags, setSmartTags] = createSignal<Tag[]>([]);
  let smartTimer: ReturnType<typeof setTimeout> | undefined;
  const handleSmartSearch = (value: string) => {
    setSmartQuery(value);
    clearTimeout(smartTimer);
    smartTimer = setTimeout(() => setSmartDebounced(value), 400);
  };

  const smartTxQuery = useQuery(() => ({
    queryKey: ['organizations', props.organizationId, 'finances', 'transactions', 'smart-detect', smartDebounced()],
    queryFn: () => fetchTransactions({
      organizationId: props.organizationId,
      pageIndex: 0,
      pageSize: 20,
      search: smartDebounced(),
    }),
    enabled: smartDebounced().trim().length > 0,
  }));

  const detected = createMemo(() => {
    const txs = smartTxQuery.data?.transactions ?? [];
    if (!txs.length) {
      return null;
    }
    const cycle = detectBillingCycle(txs);
    return {
      amount: detectMedianAmount(txs),
      currency: detectCurrency(txs),
      cycle,
      nextPayment: detectNextPayment(txs, cycle),
    };
  });

  const handleSmartSave = () => {
    const d = detected();
    if (!d || !smartName().trim()) {
      return;
    }
    props.onSave({
      name: smartName().trim(),
      amount: String(d.amount),
      currency: d.currency,
      billingCycle: d.cycle,
      nextPaymentAt: d.nextPayment ? d.nextPayment.toISOString().split('T')[0]! : '',
      category: null,
      notes: '',
      transactionSearchQuery: smartQuery(),
      tagIds: smartTags().map(t => t.id),
    });
  };

  return (
    <Dialog open={props.isOpen} onOpenChange={open => !open && props.onClose()}>
      <DialogContent class="max-w-md max-h-[90vh] flex flex-col">
        <DialogHeader>
          <DialogTitle>{isEditing ? t('finances.subscriptions.edit') : t('finances.subscriptions.add')}</DialogTitle>
        </DialogHeader>

        <div class="flex flex-col gap-4 mt-2 overflow-y-auto pr-1">

          {/* Mode toggle — only when creating */}
          <Show when={!isEditing}>
            <div class="grid grid-cols-2 gap-1 p-1 bg-muted rounded-lg">
              <button
                type="button"
                onClick={() => setMode('smart')}
                class={cn(
                  'flex items-center justify-center gap-1.5 px-3 py-2 rounded-md text-sm font-medium transition-all',
                  mode() === 'smart' ? 'bg-background text-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground',
                )}
              >
                <div class="i-tabler-wand size-3.5" />
                {t('finances.subscriptions.mode.smart')}
              </button>
              <button
                type="button"
                onClick={() => setMode('manual')}
                class={cn(
                  'flex items-center justify-center gap-1.5 px-3 py-2 rounded-md text-sm font-medium transition-all',
                  mode() === 'manual' ? 'bg-background text-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground',
                )}
              >
                <div class="i-tabler-pencil size-3.5" />
                {t('finances.subscriptions.mode.manual')}
              </button>
            </div>
          </Show>

          {/* ─── SMART MODE ─── */}
          <Show when={mode() === 'smart'}>
            <div class="flex flex-col gap-3">
              <div class="flex flex-col gap-1">
                <label class="text-sm font-medium">{t('finances.subscriptions.form.name')}</label>
                <TextFieldRoot>
                  <TextField
                    placeholder={t('finances.subscriptions.form.name.placeholder')}
                    value={smartName()}
                    onInput={e => setSmartName(e.currentTarget.value)}
                  />
                </TextFieldRoot>
              </div>

              <div class="flex flex-col gap-1">
                <label class="text-sm font-medium">{t('finances.subscriptions.form.search')}</label>
                <TextFieldRoot>
                  <TextField
                    placeholder={t('finances.subscriptions.form.search.placeholder')}
                    value={smartQuery()}
                    onInput={e => handleSmartSearch(e.currentTarget.value)}
                  />
                </TextFieldRoot>
                <p class="text-xs text-muted-foreground">{t('finances.subscriptions.form.search.help')}</p>
              </div>

              <Show when={smartDebounced().trim().length > 0}>
                <SubscriptionTransactions
                  organizationId={props.organizationId}
                  searchQuery={smartDebounced()}
                />
              </Show>

              <Show when={detected()}>
                {d => (
                  <div class="rounded-lg border border-violet-200 dark:border-violet-800 bg-violet-50 dark:bg-violet-950/20 p-3">
                    <div class="flex items-center gap-1.5 text-xs font-semibold text-violet-700 dark:text-violet-400 mb-2.5">
                      <div class="i-tabler-sparkles size-3.5" />
                      {t('finances.subscriptions.detected.title')}
                    </div>
                    <div class="grid grid-cols-2 gap-x-6 gap-y-1.5 text-xs">
                      <div class="flex items-center justify-between gap-2">
                        <span class="text-muted-foreground">{t('finances.subscriptions.detected.amount')}</span>
                        <span class="font-semibold tabular-nums">{formatCurrency(d().amount, d().currency)}</span>
                      </div>
                      <div class="flex items-center justify-between gap-2">
                        <span class="text-muted-foreground">{t('finances.subscriptions.detected.cycle')}</span>
                        <span class="font-semibold capitalize">{t(billingCycleLabelKeys[d().cycle])}</span>
                      </div>
                      <div class="flex items-center justify-between gap-2 col-span-2">
                        <span class="text-muted-foreground">{t('finances.subscriptions.detected.next-payment')}</span>
                        <span class="font-semibold">{d().nextPayment ? formatDate(d().nextPayment!) : '—'}</span>
                      </div>
                    </div>
                  </div>
                )}
              </Show>

              <div class="flex flex-col gap-1">
                <label class="text-sm font-medium">{t('finances.subscriptions.form.tags')}</label>
                <TagList
                  tags={smartTags()}
                  organizationId={props.organizationId}
                  onChange={setSmartTags}
                  asLink={false}
                  triggerClass="h-7"
                />
                <p class="text-xs text-muted-foreground">{t('finances.subscriptions.form.tags.help')}</p>
              </div>

              <div class="flex gap-2 justify-end mt-1">
                <Button variant="outline" onClick={props.onClose}>{t('finances.common.cancel')}</Button>
                <Button
                  disabled={props.isPending || !smartName().trim() || !detected()}
                  onClick={handleSmartSave}
                >
                  {t('finances.subscriptions.add')}
                </Button>
              </div>
            </div>
          </Show>

          {/* ─── MANUAL MODE ─── */}
          <Show when={mode() === 'manual'}>
            <div class="flex flex-col gap-3">
              <div class="flex flex-col gap-1">
                <label class="text-sm font-medium">{t('finances.subscriptions.form.name')}</label>
                <TextFieldRoot>
                  <TextField
                    placeholder={t('finances.subscriptions.form.name.placeholder')}
                    value={form().name}
                    onInput={e => set('name', e.currentTarget.value)}
                  />
                </TextFieldRoot>
              </div>

              <div class="grid grid-cols-2 gap-3">
                <div class="flex flex-col gap-1">
                  <label class="text-sm font-medium">{t('finances.subscriptions.form.amount')}</label>
                  <TextFieldRoot>
                    <TextField
                      type="number"
                      placeholder="0.00"
                      value={form().amount}
                      onInput={e => set('amount', e.currentTarget.value)}
                    />
                  </TextFieldRoot>
                </div>
                <div class="flex flex-col gap-1">
                  <label class="text-sm font-medium">{t('finances.subscriptions.form.currency')}</label>
                  <TextFieldRoot>
                    <TextField
                      placeholder="USD"
                      value={form().currency}
                      onInput={e => set('currency', e.currentTarget.value.toUpperCase().slice(0, 3))}
                    />
                  </TextFieldRoot>
                </div>
              </div>

              <div class="flex flex-col gap-1">
                <label class="text-sm font-medium">{t('finances.subscriptions.form.billing-cycle')}</label>
                <Select
                  options={billingCycles()}
                  optionValue="value"
                  optionTextValue="label"
                  value={billingCycles().find(c => c.value === form().billingCycle) ?? billingCycles()[1]}
                  onChange={v => v && set('billingCycle', v.value)}
                  itemComponent={prps => <SelectItem item={prps.item}>{prps.item.rawValue.label}</SelectItem>}
                >
                  <SelectTrigger>
                    <SelectValue<{ value: string; label: string }>>
                      {state => state.selectedOption()?.label}
                    </SelectValue>
                  </SelectTrigger>
                  <SelectContent />
                </Select>
              </div>

              <div class="flex flex-col gap-1">
                <label class="text-sm font-medium">{t('finances.subscriptions.form.next-payment')}</label>
                <TextFieldRoot>
                  <TextField
                    type="date"
                    value={form().nextPaymentAt}
                    onInput={e => set('nextPaymentAt', e.currentTarget.value)}
                  />
                </TextFieldRoot>
              </div>

              <div class="flex flex-col gap-1">
                <label class="text-sm font-medium">{t('finances.subscriptions.form.category')}</label>
                <Select
                  options={categories()}
                  optionValue="value"
                  optionTextValue="label"
                  value={categories().find(c => c.value === form().category) ?? categories()[0]}
                  onChange={v => v != null && set('category', v.value)}
                  itemComponent={prps => <SelectItem item={prps.item}>{prps.item.rawValue.label}</SelectItem>}
                >
                  <SelectTrigger>
                    <SelectValue<{ value: string | null; label: string }>>
                      {state => state.selectedOption()?.label ?? t('finances.category.none')}
                    </SelectValue>
                  </SelectTrigger>
                  <SelectContent />
                </Select>
              </div>

              <div class="flex flex-col gap-1">
                <label class="text-sm font-medium">{t('finances.subscriptions.form.notes')}</label>
                <TextFieldRoot>
                  <TextField
                    placeholder={t('finances.subscriptions.form.notes.placeholder')}
                    value={form().notes}
                    onInput={e => set('notes', e.currentTarget.value)}
                  />
                </TextFieldRoot>
              </div>

              <div class="flex flex-col gap-1">
                <label class="text-sm font-medium">{t('finances.subscriptions.form.transaction-search')}</label>
                <TextFieldRoot>
                  <TextField
                    placeholder={t('finances.subscriptions.form.transaction-search.placeholder')}
                    value={form().transactionSearchQuery}
                    onInput={e => handleSearchInput(e.currentTarget.value)}
                  />
                </TextFieldRoot>
                <p class="text-xs text-muted-foreground">{t('finances.subscriptions.form.transaction-search.help')}</p>
                <Show when={debouncedSearch().trim().length > 0}>
                  <SubscriptionTransactions
                    organizationId={props.organizationId}
                    searchQuery={debouncedSearch()}
                  />
                </Show>
              </div>

              <div class="flex flex-col gap-1">
                <label class="text-sm font-medium">{t('finances.subscriptions.form.tags')}</label>
                <TagList
                  tags={manualTags()}
                  organizationId={props.organizationId}
                  onChange={setManualTags}
                  asLink={false}
                  triggerClass="h-7"
                />
                <p class="text-xs text-muted-foreground">{t('finances.subscriptions.form.tags.help')}</p>
              </div>

              <div class="flex gap-2 justify-end mt-2">
                <Button variant="outline" onClick={props.onClose}>{t('finances.common.cancel')}</Button>
                <Button
                  disabled={props.isPending || !form().name || !form().amount}
                  onClick={() => props.onSave({ ...form(), tagIds: manualTags().map(t => t.id) })}
                >
                  {isEditing ? t('finances.common.save-changes') : t('finances.subscriptions.add')}
                </Button>
              </div>
            </div>
          </Show>

        </div>
      </DialogContent>
    </Dialog>
  );
};

const SubscriptionTransactions: Component<{ organizationId: string; searchQuery: string }> = (props) => {
  const { t } = useI18n();
  const txQuery = useQuery(() => ({
    queryKey: ['organizations', props.organizationId, 'finances', 'transactions', 'subscription-search', props.searchQuery],
    queryFn: () => fetchTransactions({
      organizationId: props.organizationId,
      pageIndex: 0,
      pageSize: 5,
      search: props.searchQuery,
    }),
    enabled: props.searchQuery.trim().length > 0,
  }));

  return (
    <div class="rounded-md border bg-muted/30 overflow-hidden">
      <div class="flex items-center justify-between px-3 py-2 border-b bg-muted/50">
        <span class="text-xs font-medium text-muted-foreground">{t('finances.subscriptions.matching.title')}</span>
        <Show when={txQuery.data?.transactionsCount}>
          <span class="text-xs text-muted-foreground">
            {t('finances.subscriptions.matching.found', { count: txQuery.data!.transactionsCount })}
          </span>
        </Show>
      </div>
      <div class="max-h-40 overflow-y-auto">
        <Show when={txQuery.isLoading}>
          <div class="flex items-center gap-2 px-3 py-3">
            <div class="i-tabler-loader-2 size-3.5 animate-spin text-muted-foreground" />
            <span class="text-xs text-muted-foreground">{t('finances.subscriptions.matching.searching')}</span>
          </div>
        </Show>
        <Show when={!txQuery.isLoading && (txQuery.data?.transactions?.length ?? 0) === 0}>
          <div class="flex items-center gap-2 px-3 py-3">
            <div class="i-tabler-search-off size-3.5 text-muted-foreground" />
            <span class="text-xs text-muted-foreground">{t('finances.subscriptions.matching.empty')}</span>
          </div>
        </Show>
        <Show when={(txQuery.data?.transactions?.length ?? 0) > 0}>
          <div class="divide-y">
            <For each={txQuery.data?.transactions}>
              {(tx: Transaction) => (
                <div class="flex items-center justify-between px-3 py-2 gap-3">
                  <div class="flex items-center gap-2 min-w-0">
                    <span class="text-xs text-muted-foreground shrink-0 tabular-nums">
                      {new Intl.DateTimeFormat(getDocumentLocale(), { month: 'short', day: 'numeric' }).format(new Date(tx.date))}
                    </span>
                    <span class="text-xs truncate">{tx.description || tx.counterparty}</span>
                  </div>
                  <span class={cn('text-xs shrink-0 font-medium tabular-nums', tx.amount < 0 ? 'text-destructive' : 'text-emerald-600')}>
                    {new Intl.NumberFormat(getDocumentLocale(), { style: 'currency', currency: tx.currency, minimumFractionDigits: 2 }).format(tx.amount)}
                  </span>
                </div>
              )}
            </For>
          </div>
          <Show when={(txQuery.data?.transactionsCount ?? 0) > 5}>
            <div class="px-3 py-2 border-t">
              <span class="text-xs text-muted-foreground">
                {t('finances.subscriptions.matching.more', { count: txQuery.data!.transactionsCount - 5 })}
              </span>
            </div>
          </Show>
        </Show>
      </div>
    </div>
  );
};

function getPaymentDatesInMonth(sub: Subscription, year: number, month: number): Date[] {
  if (!sub.nextPaymentAt) {
    return [];
  }
  const anchor = new Date(sub.nextPaymentAt);
  const firstDay = new Date(year, month, 1);
  const lastDay = new Date(year, month + 1, 0);
  const results: Date[] = [];

  if (sub.billingCycle === 'monthly') {
    results.push(new Date(year, month, Math.min(anchor.getDate(), lastDay.getDate())));
  } else if (sub.billingCycle === 'yearly') {
    if (anchor.getMonth() === month) {
      results.push(new Date(year, month, Math.min(anchor.getDate(), lastDay.getDate())));
    }
  } else if (sub.billingCycle === 'quarterly') {
    const anchorMonths = anchor.getFullYear() * 12 + anchor.getMonth();
    const targetMonths = year * 12 + month;
    if (((targetMonths - anchorMonths) % 3 + 3) % 3 === 0) {
      results.push(new Date(year, month, Math.min(anchor.getDate(), lastDay.getDate())));
    }
  } else if (sub.billingCycle === 'weekly') {
    let current = new Date(anchor);
    while (current >= firstDay) {
      current = new Date(current.getTime() - 7 * 86400000);
    }
    current = new Date(current.getTime() + 7 * 86400000);
    while (current <= lastDay) {
      results.push(new Date(current));
      current = new Date(current.getTime() + 7 * 86400000);
    }
  }
  return results;
}

const DOT_COLORS = ['#8b5cf6', '#3b82f6', '#10b981', '#f97316', '#f43f5e', '#06b6d4', '#f59e0b', '#ec4899'];

export const SubscriptionsPage: Component = () => {
  const { t, getLocale } = useI18n();
  // Monday-first weekday names in the active locale (2024-01-01 is a Monday).
  const weekDays = () => Array.from({ length: 7 }, (_, index) => new Intl.DateTimeFormat(getLocale(), { weekday: 'short' }).format(new Date(2024, 0, 1 + index)));
  const params = useParams();
  const queryClient = useQueryClient();
  const { confirm } = useConfirmModal();
  const [dialogOpen, setDialogOpen] = createSignal(false);
  const [editingSub, setEditingSub] = createSignal<Subscription | undefined>();

  const subsQuery = useQuery(() => ({
    queryKey: ['organizations', params.organizationId, 'finances', 'subscriptions'],
    queryFn: () => fetchSubscriptions({ organizationId: params.organizationId }),
  }));

  const invalidate = () => queryClient.invalidateQueries({ queryKey: ['organizations', params.organizationId, 'finances', 'subscriptions'] });

  const createMut = createMutation(() => ({
    mutationFn: (data: FormState) => createSubscription({
      organizationId: params.organizationId,
      subscription: {
        name: data.name,
        amount: Number(data.amount),
        currency: data.currency,
        billingCycle: data.billingCycle,
        nextPaymentAt: data.nextPaymentAt ? new Date(data.nextPaymentAt) : null,
        category: data.category,
        notes: data.notes || null,
        transactionSearchQuery: data.transactionSearchQuery || null,
        tagIds: data.tagIds ?? [],
      },
    }),
    onSuccess: () => {
      createToast({ message: t('finances.subscriptions.toast.added'), type: 'success' });
      invalidate();
      setDialogOpen(false);
    },
    onError: () => createToast({ message: t('finances.subscriptions.toast.add-error'), type: 'error' }),
  }));

  const updateMut = createMutation(() => ({
    mutationFn: ({ id, data }: { id: string; data: FormState }) => updateSubscription({
      organizationId: params.organizationId,
      subscriptionId: id,
      updates: {
        name: data.name,
        amount: Number(data.amount),
        currency: data.currency,
        billingCycle: data.billingCycle,
        nextPaymentAt: data.nextPaymentAt ? new Date(data.nextPaymentAt) : null,
        category: data.category,
        notes: data.notes || null,
        transactionSearchQuery: data.transactionSearchQuery || null,
        tagIds: data.tagIds ?? [],
      },
    }),
    onSuccess: () => {
      createToast({ message: t('finances.subscriptions.toast.updated'), type: 'success' });
      invalidate();
      setEditingSub(undefined);
    },
    onError: () => createToast({ message: t('finances.subscriptions.toast.update-error'), type: 'error' }),
  }));

  const toggleMut = createMutation(() => ({
    mutationFn: ({ id, isActive }: { id: string; isActive: boolean }) =>
      updateSubscription({ organizationId: params.organizationId, subscriptionId: id, updates: { isActive } }),
    onSuccess: () => invalidate(),
  }));

  const deleteMut = createMutation(() => ({
    mutationFn: (id: string) => deleteSubscription({ organizationId: params.organizationId, subscriptionId: id }),
    onSuccess: () => {
      createToast({ message: t('finances.subscriptions.toast.deleted'), type: 'success' });
      invalidate();
    },
    onError: () => createToast({ message: t('finances.subscriptions.toast.delete-error'), type: 'error' }),
  }));

  const activeSubs = () => subsQuery.data?.subscriptions.filter(s => s.isActive) ?? [];
  const totalMonthly = () =>
    activeSubs().reduce((sum, s) => sum + toMonthlyAmount(s.amount, s.billingCycle), 0);
  const totalYearly = () => totalMonthly() * 12;

  function openAddDialog() {
    setEditingSub(undefined);
    setDialogOpen(true);
  }

  function openEditDialog(sub: Subscription) {
    setEditingSub(sub);
    setSelectedDay(null);
    setDialogOpen(true);
  }

  function closeDialog() {
    setDialogOpen(false);
    setEditingSub(undefined);
  }

  function triggerDelete(sub: Subscription) {
    const id = sub.id;
    const name = sub.name;
    void confirm({
      title: t('finances.subscriptions.delete.title'),
      message: t('finances.subscriptions.delete.message', { name }),
      confirmButton: { text: t('finances.common.delete'), variant: 'destructive' },
    }).then((ok) => {
      if (ok) {
        deleteMut.mutate(id);
      }
    });
  }

  // Calendar
  const today = new Date();
  const todayKey = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;
  const [viewYear, setViewYear] = createSignal(today.getFullYear());
  const [viewMonth, setViewMonth] = createSignal(today.getMonth());
  const [selectedDay, setSelectedDay] = createSignal<Date | null>(null);
  const monthLabel = () => new Intl.DateTimeFormat(getLocale(), { month: 'long', year: 'numeric' }).format(new Date(viewYear(), viewMonth(), 1));

  function prevMonth() {
    if (viewMonth() === 0) {
      setViewYear(y => y - 1); setViewMonth(11);
    } else {
      setViewMonth(m => m - 1);
    }
  }

  function nextMonth() {
    if (viewMonth() === 11) {
      setViewYear(y => y + 1); setViewMonth(0);
    } else {
      setViewMonth(m => m + 1);
    }
  }

  const calendarData = createMemo(() => {
    const year = viewYear();
    const month = viewMonth();
    const firstDay = new Date(year, month, 1);
    const lastDay = new Date(year, month + 1, 0);
    const offset = (firstDay.getDay() + 6) % 7;
    const days: Array<{ date: Date | null; key: string }> = [];
    for (let i = 0; i < offset; i++) {
      days.push({ date: null, key: `s${i}` });
    }
    for (let d = 1; d <= lastDay.getDate(); d++) {
      const date = new Date(year, month, d);
      days.push({ date, key: `${year}-${String(month + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}` });
    }
    const trailing = (7 - (days.length % 7)) % 7;
    for (let i = 0; i < trailing; i++) {
      days.push({ date: null, key: `e${i}` });
    }
    return days;
  });

  const daySubsMap = createMemo(() => {
    const year = viewYear();
    const month = viewMonth();
    const map = new Map<string, Subscription[]>();
    for (const sub of activeSubs()) {
      for (const d of getPaymentDatesInMonth(sub, year, month)) {
        const k = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
        if (!map.has(k)) {
          map.set(k, []);
        }
        map.get(k)!.push(sub);
      }
    }
    return map;
  });

  const subColorMap = createMemo(() => {
    const map = new Map<string, string>();
    activeSubs().forEach((sub, i) => map.set(sub.id, DOT_COLORS[i % DOT_COLORS.length]!));
    return map;
  });

  return (
    <div class="page">
      {/* Header */}
      <div class="page-header">
        <div>
          <h1 class="page-title">{t('finances.subscriptions.title')}</h1>
          <p class="page-description">{t('finances.subscriptions.description')}</p>
        </div>
        <Button size="sm" class="h-8 text-xs gap-1.5" onClick={openAddDialog}>
          <div class="i-tabler-plus size-3.5" />
          {t('finances.subscriptions.add')}
        </Button>
      </div>

      <div>
        {/* Summary */}
        <Show when={(subsQuery.data?.subscriptions?.length ?? 0) > 0}>
          <div class="grid grid-cols-2 gap-3 mb-6">
            <div class="border rounded-lg p-4">
              <div class="text-xs text-muted-foreground mb-1">{t('finances.subscriptions.summary.monthly')}</div>
              <div class="text-2xl font-bold">{formatCurrency(totalMonthly())}</div>
            </div>
            <div class="border rounded-lg p-4">
              <div class="text-xs text-muted-foreground mb-1">{t('finances.subscriptions.summary.yearly')}</div>
              <div class="text-2xl font-bold">{formatCurrency(totalYearly())}</div>
            </div>
          </div>
        </Show>

        <Show
          when={(subsQuery.data?.subscriptions?.length ?? 0) > 0}
          fallback={(
            <div class="text-center py-16">
              <div class="i-tabler-repeat size-12 mx-auto text-muted-foreground opacity-40 mb-4" />
              <h3 class="text-lg font-medium mb-1">{t('finances.subscriptions.empty.title')}</h3>
              <p class="text-muted-foreground text-sm mb-4">{t('finances.subscriptions.empty.description')}</p>
              <Button onClick={openAddDialog}>
                <div class="i-tabler-plus size-4 mr-1" />
                {t('finances.subscriptions.add')}
              </Button>
            </div>
          )}
        >
          {/* Calendar */}
          <div class="border rounded-lg overflow-hidden">
            {/* Month navigation */}
            <div class="flex items-center justify-between px-4 py-3 border-b bg-muted/30">
              <button type="button" class="p-1.5 rounded-md hover:bg-muted transition-colors" aria-label={t('finances.subscriptions.previous-month')} onClick={prevMonth}>
                <div class="i-tabler-chevron-left size-4" />
              </button>
              <div class="flex items-center gap-2">
                <span class="font-semibold text-sm capitalize">{monthLabel()}</span>
                <Show when={viewYear() !== today.getFullYear() || viewMonth() !== today.getMonth()}>
                  <button
                    class="text-xs text-muted-foreground hover:text-foreground transition-colors px-1.5 py-0.5 rounded border border-transparent hover:border-border"
                    onClick={() => {
                      setViewYear(today.getFullYear()); setViewMonth(today.getMonth());
                    }}
                  >
                    {t('finances.common.today')}
                  </button>
                </Show>
              </div>
              <button type="button" class="p-1.5 rounded-md hover:bg-muted transition-colors" aria-label={t('finances.subscriptions.next-month')} onClick={nextMonth}>
                <div class="i-tabler-chevron-right size-4" />
              </button>
            </div>

            {/* Weekday headers */}
            <div class="grid grid-cols-7 border-b bg-muted/20">
              <For each={weekDays()}>
                {wd => <div class="text-center py-2 text-xs font-medium text-muted-foreground">{wd}</div>}
              </For>
            </div>

            {/* Day grid */}
            <div class="grid grid-cols-7">
              <For each={calendarData()}>
                {({ date, key }) => {
                  if (!date) {
                    return <div class="min-h-[80px] border-r border-b bg-muted/5 last:border-r-0" />;
                  }
                  const daySubs = () => daySubsMap().get(key) ?? [];
                  const isToday = key === todayKey;
                  return (
                    <div
                      class={cn(
                        'min-h-[80px] border-r border-b p-1.5 flex flex-col gap-1 transition-colors last:border-r-0',
                        daySubs().length > 0 ? 'cursor-pointer hover:bg-muted/30' : '',
                        isToday && 'bg-primary/5',
                      )}
                      onClick={() => daySubs().length > 0 && setSelectedDay(date)}
                    >
                      <span class={cn(
                        'text-xs font-medium leading-none w-5 h-5 flex items-center justify-center rounded-full self-start',
                        isToday ? 'bg-primary text-primary-foreground' : 'text-muted-foreground',
                      )}
                      >
                        {date.getDate()}
                      </span>
                      <div class="flex flex-wrap gap-0.5 mt-auto">
                        <For each={daySubs().slice(0, 4)}>
                          {sub => (
                            <span
                              class="size-2 rounded-full"
                              style={{ background: subColorMap().get(sub.id) ?? '#8b5cf6' }}
                              title={sub.name}
                            />
                          )}
                        </For>
                        <Show when={daySubs().length > 4}>
                          <span class="text-[10px] text-muted-foreground leading-none">{`+${daySubs().length - 4}`}</span>
                        </Show>
                      </div>
                    </div>
                  );
                }}
              </For>
            </div>
          </div>

          {/* Legend */}
          <div class="mt-4 flex flex-wrap gap-x-4 gap-y-2">
            <For each={activeSubs()}>
              {(sub, i) => (
                <button
                  class="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors group"
                  onClick={() => openEditDialog(sub)}
                  title={t('finances.subscriptions.click-to-edit')}
                >
                  <span
                    class="size-2 rounded-full shrink-0"
                    style={{ background: DOT_COLORS[i() % DOT_COLORS.length] }}
                  />
                  <span class="group-hover:underline">{sub.name}</span>
                  <span class="text-muted-foreground/60">
                    {'\u00A0'}
                    {formatCurrency(sub.amount, sub.currency)}
                    /
                    {t(billingCycleShortLabelKeys[sub.billingCycle])}
                  </span>
                </button>
              )}
            </For>
          </div>
        </Show>

        {/* Day detail dialog */}
        <Show when={selectedDay()}>
          {(day) => {
            const dayKey = `${day().getFullYear()}-${String(day().getMonth() + 1).padStart(2, '0')}-${String(day().getDate()).padStart(2, '0')}`;
            return (
              <Dialog open onOpenChange={open => !open && setSelectedDay(null)}>
                <DialogContent class="max-w-sm">
                  <DialogHeader>
                    <DialogTitle class="flex items-center gap-2">
                      <div class="i-tabler-calendar-event size-4 text-muted-foreground" />
                      {new Intl.DateTimeFormat(getLocale(), { weekday: 'long', month: 'long', day: 'numeric' }).format(day())}
                    </DialogTitle>
                  </DialogHeader>
                  <div class="flex flex-col gap-2 mt-2">
                    <For each={daySubsMap().get(dayKey) ?? []}>
                      {sub => (
                        <div class="flex items-center gap-2">
                          <button
                            class="flex items-center gap-3 p-3 rounded-lg border hover:bg-muted/50 transition-colors text-left flex-1 min-w-0"
                            onClick={() => openEditDialog(sub)}
                          >
                            <span
                              class="size-2.5 rounded-full shrink-0"
                              style={{ background: subColorMap().get(sub.id) ?? '#8b5cf6' }}
                            />
                            <div class="flex-1 min-w-0">
                              <div class="text-sm font-medium truncate">{sub.name}</div>
                              <div class="text-xs text-muted-foreground">
                                {formatCurrency(sub.amount, sub.currency)}
                                {' '}
                                ·
                                {t(billingCycleLabelKeys[sub.billingCycle])}
                              </div>
                            </div>
                            <div class="i-tabler-pencil size-3.5 text-muted-foreground shrink-0" />
                          </button>
                          <button
                            class="p-2.5 rounded-lg border hover:bg-destructive/10 hover:border-destructive/30 hover:text-destructive transition-colors shrink-0"
                            onClick={() => {
                              setSelectedDay(null); triggerDelete(sub);
                            }}
                            title={t('finances.common.delete')}
                          >
                            <div class="i-tabler-trash size-4" />
                          </button>
                        </div>
                      )}
                    </For>
                  </div>
                </DialogContent>
              </Dialog>
            );
          }}
        </Show>

        {/* Form dialog */}
        <Show when={dialogOpen()}>
          <SubscriptionFormDialog
            isOpen={dialogOpen()}
            onClose={closeDialog}
            initial={editingSub()}
            isPending={createMut.isPending || updateMut.isPending}
            organizationId={params.organizationId}
            onSave={(data) => {
              const current = editingSub();
              if (current) {
                updateMut.mutate({ id: current.id, data });
              } else {
                createMut.mutate(data);
              }
            }}
          />
        </Show>
      </div>
    </div>
  );
};
