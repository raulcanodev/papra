import type { Component } from 'solid-js';
import type { Tag } from '@/modules/tags/tags.types';
import type { BillingCycle, Subscription, Transaction } from '../finances.types';
import { useParams } from '@solidjs/router';
import { createMutation, useQuery, useQueryClient } from '@tanstack/solid-query';
import { createMemo, createSignal, For, Show } from 'solid-js';
import { useConfirmModal } from '@/modules/shared/confirm';
import { cn } from '@/modules/shared/style/cn';
import { TagList } from '@/modules/tags/components/tag-list.component';
import { Badge } from '@/modules/ui/components/badge';
import { Button } from '@/modules/ui/components/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/modules/ui/components/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/modules/ui/components/select';
import { createToast } from '@/modules/ui/components/sonner';
import { TextField, TextFieldRoot } from '@/modules/ui/components/textfield';
import { createSubscription, deleteSubscription, fetchSubscriptions, fetchTransactions, updateSubscription } from '../finances.services';

const BILLING_CYCLES: { value: BillingCycle; label: string }[] = [
  { value: 'weekly', label: 'Weekly' },
  { value: 'monthly', label: 'Monthly' },
  { value: 'quarterly', label: 'Quarterly' },
  { value: 'yearly', label: 'Yearly' },
];

const CATEGORIES = [
  { value: null as string | null, label: 'None' },
  { value: 'expense', label: 'Expense' },
  { value: 'income', label: 'Income' },
  { value: 'owner_transfer', label: 'Owner Transfer' },
  { value: 'internal_transfer', label: 'Internal Transfer' },
];

function toMonthlyAmount(amount: number, cycle: BillingCycle): number {
  switch (cycle) {
    case 'weekly': return amount * 52 / 12;
    case 'monthly': return amount;
    case 'quarterly': return amount / 3;
    case 'yearly': return amount / 12;
  }
}

function formatCurrency(amount: number, currency = 'USD') {
  return new Intl.NumberFormat('en-US', { style: 'currency', currency, minimumFractionDigits: 2 }).format(amount);
}

function formatDate(date: Date | string | null) {
  if (!date) {
    return '—';
  }
  return new Intl.DateTimeFormat('en-US', { year: 'numeric', month: 'short', day: 'numeric' }).format(new Date(date));
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
  if (transactions.length < 2) return 'monthly';
  const sorted = [...transactions].sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());
  const intervals: number[] = [];
  for (let i = 1; i < sorted.length; i++) {
    intervals.push((new Date(sorted[i]!.date).getTime() - new Date(sorted[i - 1]!.date).getTime()) / 86400000);
  }
  const avg = intervals.reduce((a, b) => a + b, 0) / intervals.length;
  if (avg < 10) return 'weekly';
  if (avg < 50) return 'monthly';
  if (avg < 120) return 'quarterly';
  return 'yearly';
}

function detectMedianAmount(transactions: Transaction[]): number {
  if (!transactions.length) return 0;
  const sorted = transactions.map(t => Math.abs(t.amount)).sort((a, b) => a - b);
  return sorted[Math.floor(sorted.length / 2)]!;
}

function detectCurrency(transactions: Transaction[]): string {
  if (!transactions.length) return 'USD';
  const counts: Record<string, number> = {};
  for (const t of transactions) counts[t.currency] = (counts[t.currency] ?? 0) + 1;
  return Object.entries(counts).sort((a, b) => b[1] - a[1])[0]?.[0] ?? 'USD';
}

function detectNextPayment(transactions: Transaction[], cycle: BillingCycle): Date | null {
  if (!transactions.length) return null;
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
  const isEditing = !!props.initial;

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
    if (!txs.length) return null;
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
    if (!d || !smartName().trim()) return;
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
          <DialogTitle>{isEditing ? 'Edit subscription' : 'Add subscription'}</DialogTitle>
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
                Smart
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
                Manual
              </button>
            </div>
          </Show>

          {/* ─── SMART MODE ─── */}
          <Show when={mode() === 'smart'}>
            <div class="flex flex-col gap-3">
              <div class="flex flex-col gap-1">
                <label class="text-sm font-medium">Name</label>
                <TextFieldRoot>
                  <TextField
                    placeholder="e.g. AWS, Notion, Figma"
                    value={smartName()}
                    onInput={e => setSmartName(e.currentTarget.value)}
                  />
                </TextFieldRoot>
              </div>

              <div class="flex flex-col gap-1">
                <label class="text-sm font-medium">Search transactions</label>
                <TextFieldRoot>
                  <TextField
                    placeholder="e.g. Stripe, Figma… auto-detects amount & cycle"
                    value={smartQuery()}
                    onInput={e => handleSmartSearch(e.currentTarget.value)}
                  />
                </TextFieldRoot>
                <p class="text-xs text-muted-foreground">We'll detect the amount and billing cycle from matching transactions.</p>
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
                      Detected from transactions
                    </div>
                    <div class="grid grid-cols-2 gap-x-6 gap-y-1.5 text-xs">
                      <div class="flex items-center justify-between gap-2">
                        <span class="text-muted-foreground">Amount</span>
                        <span class="font-semibold tabular-nums">{formatCurrency(d().amount, d().currency)}</span>
                      </div>
                      <div class="flex items-center justify-between gap-2">
                        <span class="text-muted-foreground">Cycle</span>
                        <span class="font-semibold capitalize">{BILLING_CYCLES.find(c => c.value === d().cycle)?.label ?? d().cycle}</span>
                      </div>
                      <div class="flex items-center justify-between gap-2 col-span-2">
                        <span class="text-muted-foreground">Est. next payment</span>
                        <span class="font-semibold">{d().nextPayment ? formatDate(d().nextPayment!) : '—'}</span>
                      </div>
                    </div>
                  </div>
                )}
              </Show>

              <div class="flex flex-col gap-1">
                <label class="text-sm font-medium">Auto-apply tags</label>
                <TagList
                  tags={smartTags()}
                  organizationId={props.organizationId}
                  onChange={setSmartTags}
                  asLink={false}
                  triggerClass="h-7"
                />
                <p class="text-xs text-muted-foreground">These tags will be applied to all matching transactions.</p>
              </div>

              <div class="flex gap-2 justify-end mt-1">
                <Button variant="outline" onClick={props.onClose}>Cancel</Button>
                <Button
                  disabled={props.isPending || !smartName().trim() || !detected()}
                  onClick={handleSmartSave}
                >
                  Add subscription
                </Button>
              </div>
            </div>
          </Show>

          {/* ─── MANUAL MODE ─── */}
          <Show when={mode() === 'manual'}>
            <div class="flex flex-col gap-3">
              <div class="flex flex-col gap-1">
                <label class="text-sm font-medium">Name</label>
                <TextFieldRoot>
                  <TextField
                    placeholder="e.g. AWS, Notion, Figma"
                    value={form().name}
                    onInput={e => set('name', e.currentTarget.value)}
                  />
                </TextFieldRoot>
              </div>

              <div class="grid grid-cols-2 gap-3">
                <div class="flex flex-col gap-1">
                  <label class="text-sm font-medium">Amount</label>
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
                  <label class="text-sm font-medium">Currency</label>
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
                <label class="text-sm font-medium">Billing cycle</label>
                <Select
                  options={BILLING_CYCLES}
                  optionValue="value"
                  optionTextValue="label"
                  value={BILLING_CYCLES.find(c => c.value === form().billingCycle) ?? BILLING_CYCLES[1]}
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
                <label class="text-sm font-medium">Next payment date</label>
                <TextFieldRoot>
                  <TextField
                    type="date"
                    value={form().nextPaymentAt}
                    onInput={e => set('nextPaymentAt', e.currentTarget.value)}
                  />
                </TextFieldRoot>
              </div>

              <div class="flex flex-col gap-1">
                <label class="text-sm font-medium">Category</label>
                <Select
                  options={CATEGORIES}
                  optionValue="value"
                  optionTextValue="label"
                  value={CATEGORIES.find(c => c.value === form().category) ?? CATEGORIES[0]}
                  onChange={v => v != null && set('category', v.value)}
                  itemComponent={prps => <SelectItem item={prps.item}>{prps.item.rawValue.label}</SelectItem>}
                >
                  <SelectTrigger>
                    <SelectValue<{ value: string | null; label: string }>>
                      {state => state.selectedOption()?.label ?? 'None'}
                    </SelectValue>
                  </SelectTrigger>
                  <SelectContent />
                </Select>
              </div>

              <div class="flex flex-col gap-1">
                <label class="text-sm font-medium">Notes</label>
                <TextFieldRoot>
                  <TextField
                    placeholder="Optional notes"
                    value={form().notes}
                    onInput={e => set('notes', e.currentTarget.value)}
                  />
                </TextFieldRoot>
              </div>

              <div class="flex flex-col gap-1">
                <label class="text-sm font-medium">Transaction search</label>
                <TextFieldRoot>
                  <TextField
                    placeholder="e.g. AWS, Notion (matches transaction descriptions)"
                    value={form().transactionSearchQuery}
                    onInput={e => handleSearchInput(e.currentTarget.value)}
                  />
                </TextFieldRoot>
                <p class="text-xs text-muted-foreground">Transactions matching this term will be automatically linked to this subscription.</p>
                <Show when={debouncedSearch().trim().length > 0}>
                  <SubscriptionTransactions
                    organizationId={props.organizationId}
                    searchQuery={debouncedSearch()}
                  />
                </Show>
              </div>

              <div class="flex flex-col gap-1">
                <label class="text-sm font-medium">Auto-apply tags</label>
                <TagList
                  tags={manualTags()}
                  organizationId={props.organizationId}
                  onChange={setManualTags}
                  asLink={false}
                  triggerClass="h-7"
                />
                <p class="text-xs text-muted-foreground">These tags will be applied to all matching transactions.</p>
              </div>

              <div class="flex gap-2 justify-end mt-2">
                <Button variant="outline" onClick={props.onClose}>Cancel</Button>
                <Button
                  disabled={props.isPending || !form().name || !form().amount}
                  onClick={() => props.onSave({ ...form(), tagIds: manualTags().map(t => t.id) })}
                >
                  {isEditing ? 'Save changes' : 'Add subscription'}
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
        <span class="text-xs font-medium text-muted-foreground">Matching transactions</span>
        <Show when={txQuery.data?.transactionsCount}>
          <span class="text-xs text-muted-foreground">{txQuery.data!.transactionsCount} found</span>
        </Show>
      </div>
      <div class="max-h-40 overflow-y-auto">
        <Show when={txQuery.isLoading}>
          <div class="flex items-center gap-2 px-3 py-3">
            <div class="i-tabler-loader-2 size-3.5 animate-spin text-muted-foreground" />
            <span class="text-xs text-muted-foreground">Searching...</span>
          </div>
        </Show>
        <Show when={!txQuery.isLoading && (txQuery.data?.transactions?.length ?? 0) === 0}>
          <div class="flex items-center gap-2 px-3 py-3">
            <div class="i-tabler-search-off size-3.5 text-muted-foreground" />
            <span class="text-xs text-muted-foreground">No matching transactions found.</span>
          </div>
        </Show>
        <Show when={(txQuery.data?.transactions?.length ?? 0) > 0}>
          <div class="divide-y">
            <For each={txQuery.data?.transactions}>
              {(tx: Transaction) => (
                <div class="flex items-center justify-between px-3 py-2 gap-3">
                  <div class="flex items-center gap-2 min-w-0">
                    <span class="text-xs text-muted-foreground shrink-0 tabular-nums">
                      {new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric' }).format(new Date(tx.date))}
                    </span>
                    <span class="text-xs truncate">{tx.description || tx.counterparty}</span>
                  </div>
                  <span class={cn('text-xs shrink-0 font-medium tabular-nums', tx.amount < 0 ? 'text-destructive' : 'text-emerald-600')}>
                    {new Intl.NumberFormat('en-US', { style: 'currency', currency: tx.currency, minimumFractionDigits: 2 }).format(tx.amount)}
                  </span>
                </div>
              )}
            </For>
          </div>
          <Show when={(txQuery.data?.transactionsCount ?? 0) > 5}>
            <div class="px-3 py-2 border-t">
              <span class="text-xs text-muted-foreground">+{txQuery.data!.transactionsCount - 5} more transactions</span>
            </div>
          </Show>
        </Show>
      </div>
    </div>
  );
};

function getPaymentDatesInMonth(sub: Subscription, year: number, month: number): Date[] {
  if (!sub.nextPaymentAt) return [];
  const anchor = new Date(sub.nextPaymentAt);
  const firstDay = new Date(year, month, 1);
  const lastDay = new Date(year, month + 1, 0);
  const results: Date[] = [];

  if (sub.billingCycle === 'monthly') {
    results.push(new Date(year, month, Math.min(anchor.getDate(), lastDay.getDate())));
  }
  else if (sub.billingCycle === 'yearly') {
    if (anchor.getMonth() === month) {
      results.push(new Date(year, month, Math.min(anchor.getDate(), lastDay.getDate())));
    }
  }
  else if (sub.billingCycle === 'quarterly') {
    const anchorMonths = anchor.getFullYear() * 12 + anchor.getMonth();
    const targetMonths = year * 12 + month;
    if (((targetMonths - anchorMonths) % 3 + 3) % 3 === 0) {
      results.push(new Date(year, month, Math.min(anchor.getDate(), lastDay.getDate())));
    }
  }
  else if (sub.billingCycle === 'weekly') {
    let current = new Date(anchor);
    while (current >= firstDay) current = new Date(current.getTime() - 7 * 86400000);
    current = new Date(current.getTime() + 7 * 86400000);
    while (current <= lastDay) {
      results.push(new Date(current));
      current = new Date(current.getTime() + 7 * 86400000);
    }
  }
  return results;
}

const DOT_COLORS = ['#8b5cf6', '#3b82f6', '#10b981', '#f97316', '#f43f5e', '#06b6d4', '#f59e0b', '#ec4899'];
const MONTH_NAMES = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
const WEEK_DAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

export const SubscriptionsPage: Component = () => {
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
      createToast({ message: 'Subscription added', type: 'success' });
      invalidate();
      setDialogOpen(false);
    },
    onError: () => createToast({ message: 'Failed to add subscription', type: 'error' }),
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
      createToast({ message: 'Subscription updated', type: 'success' });
      invalidate();
      setEditingSub(undefined);
    },
    onError: () => createToast({ message: 'Failed to update subscription', type: 'error' }),
  }));

  const toggleMut = createMutation(() => ({
    mutationFn: ({ id, isActive }: { id: string; isActive: boolean }) =>
      updateSubscription({ organizationId: params.organizationId, subscriptionId: id, updates: { isActive } }),
    onSuccess: () => invalidate(),
  }));

  const deleteMut = createMutation(() => ({
    mutationFn: (id: string) => deleteSubscription({ organizationId: params.organizationId, subscriptionId: id }),
    onSuccess: () => {
      createToast({ message: 'Subscription deleted', type: 'success' });
      invalidate();
    },
    onError: () => createToast({ message: 'Failed to delete subscription', type: 'error' }),
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
      title: 'Delete subscription',
      message: `Delete "${name}"?`,
      confirmButton: { text: 'Delete', variant: 'destructive' },
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

  function prevMonth() {
    if (viewMonth() === 0) { setViewYear(y => y - 1); setViewMonth(11); }
    else setViewMonth(m => m - 1);
  }

  function nextMonth() {
    if (viewMonth() === 11) { setViewYear(y => y + 1); setViewMonth(0); }
    else setViewMonth(m => m + 1);
  }

  const calendarData = createMemo(() => {
    const year = viewYear();
    const month = viewMonth();
    const firstDay = new Date(year, month, 1);
    const lastDay = new Date(year, month + 1, 0);
    const offset = (firstDay.getDay() + 6) % 7;
    const days: Array<{ date: Date | null; key: string }> = [];
    for (let i = 0; i < offset; i++) days.push({ date: null, key: `s${i}` });
    for (let d = 1; d <= lastDay.getDate(); d++) {
      const date = new Date(year, month, d);
      days.push({ date, key: `${year}-${String(month + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}` });
    }
    const trailing = (7 - (days.length % 7)) % 7;
    for (let i = 0; i < trailing; i++) days.push({ date: null, key: `e${i}` });
    return days;
  });

  const daySubsMap = createMemo(() => {
    const year = viewYear();
    const month = viewMonth();
    const map = new Map<string, Subscription[]>();
    for (const sub of activeSubs()) {
      for (const d of getPaymentDatesInMonth(sub, year, month)) {
        const k = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
        if (!map.has(k)) map.set(k, []);
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
    <div class="flex flex-col h-full">
      {/* Header */}
      <div class="border-b px-6 py-3 flex items-center justify-between shrink-0 bg-background">
        <div>
          <h1 class="text-sm font-semibold leading-none">Subscriptions</h1>
          <p class="text-xs text-muted-foreground mt-0.5">Track your recurring costs</p>
        </div>
        <Button size="sm" class="h-8 text-xs gap-1.5" onClick={openAddDialog}>
          <div class="i-tabler-plus size-3.5" />
          Add subscription
        </Button>
      </div>

      <div class="p-6 max-w-5xl mx-auto w-full overflow-y-auto flex-1">
        {/* Summary */}
        <Show when={(subsQuery.data?.subscriptions?.length ?? 0) > 0}>
          <div class="grid grid-cols-2 gap-3 mb-6">
            <div class="border rounded-lg p-4">
              <div class="text-xs text-muted-foreground mb-1">Monthly cost (active)</div>
              <div class="text-2xl font-bold">{formatCurrency(totalMonthly())}</div>
            </div>
            <div class="border rounded-lg p-4">
              <div class="text-xs text-muted-foreground mb-1">Yearly cost (active)</div>
              <div class="text-2xl font-bold">{formatCurrency(totalYearly())}</div>
            </div>
          </div>
        </Show>

        <Show
          when={(subsQuery.data?.subscriptions?.length ?? 0) > 0}
          fallback={(
            <div class="text-center py-16">
              <div class="i-tabler-repeat size-12 mx-auto text-muted-foreground opacity-40 mb-4" />
              <h3 class="text-lg font-medium mb-1">No subscriptions yet</h3>
              <p class="text-muted-foreground text-sm mb-4">Add your recurring costs to track monthly and yearly totals.</p>
              <Button onClick={openAddDialog}>
                <div class="i-tabler-plus size-4 mr-1" />
                Add subscription
              </Button>
            </div>
          )}
        >
          {/* Calendar */}
          <div class="border rounded-lg overflow-hidden">
            {/* Month navigation */}
            <div class="flex items-center justify-between px-4 py-3 border-b bg-muted/30">
              <button class="p-1.5 rounded-md hover:bg-muted transition-colors" onClick={prevMonth}>
                <div class="i-tabler-chevron-left size-4" />
              </button>
              <div class="flex items-center gap-2">
                <span class="font-semibold text-sm">{MONTH_NAMES[viewMonth()]} {viewYear()}</span>
                <Show when={viewYear() !== today.getFullYear() || viewMonth() !== today.getMonth()}>
                  <button
                    class="text-xs text-muted-foreground hover:text-foreground transition-colors px-1.5 py-0.5 rounded border border-transparent hover:border-border"
                    onClick={() => { setViewYear(today.getFullYear()); setViewMonth(today.getMonth()); }}
                  >
                    Today
                  </button>
                </Show>
              </div>
              <button class="p-1.5 rounded-md hover:bg-muted transition-colors" onClick={nextMonth}>
                <div class="i-tabler-chevron-right size-4" />
              </button>
            </div>

            {/* Weekday headers */}
            <div class="grid grid-cols-7 border-b bg-muted/20">
              <For each={WEEK_DAYS}>
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
                      )}>
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
                  title="Click to edit"
                >
                  <span
                    class="size-2 rounded-full shrink-0"
                    style={{ background: DOT_COLORS[i() % DOT_COLORS.length] }}
                  />
                  <span class="group-hover:underline">{sub.name}</span>
                  <span class="text-muted-foreground/60">{'\u00a0'}{formatCurrency(sub.amount, sub.currency)}/{sub.billingCycle.slice(0, 2)}</span>
                </button>
              )}
            </For>
          </div>
        </Show>

        {/* Day detail dialog */}
        <Show when={selectedDay()}>
          {day => {
            const dayKey = `${day().getFullYear()}-${String(day().getMonth() + 1).padStart(2, '0')}-${String(day().getDate()).padStart(2, '0')}`;
            return (
              <Dialog open onOpenChange={open => !open && setSelectedDay(null)}>
                <DialogContent class="max-w-sm">
                  <DialogHeader>
                    <DialogTitle class="flex items-center gap-2">
                      <div class="i-tabler-calendar-event size-4 text-muted-foreground" />
                      {new Intl.DateTimeFormat('en-US', { weekday: 'long', month: 'long', day: 'numeric' }).format(day())}
                    </DialogTitle>
                  </DialogHeader>
                  <div class="flex flex-col gap-2 mt-2">
                    <For each={daySubsMap().get(dayKey) ?? []}>
                      {(sub) => (
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
                                {formatCurrency(sub.amount, sub.currency)} · {BILLING_CYCLES.find(c => c.value === sub.billingCycle)?.label}
                              </div>
                            </div>
                            <div class="i-tabler-pencil size-3.5 text-muted-foreground shrink-0" />
                          </button>
                          <button
                            class="p-2.5 rounded-lg border hover:bg-destructive/10 hover:border-destructive/30 hover:text-destructive transition-colors shrink-0"
                            onClick={() => { setSelectedDay(null); triggerDelete(sub); }}
                            title="Delete"
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
