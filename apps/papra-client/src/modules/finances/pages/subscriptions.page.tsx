import type { Component } from 'solid-js';
import type { BillingCycle, Subscription } from '../finances.types';
import { useParams } from '@solidjs/router';
import { createMutation, useQuery, useQueryClient } from '@tanstack/solid-query';
import { createSignal, For, Show } from 'solid-js';
import { useConfirmModal } from '@/modules/shared/confirm';
import { cn } from '@/modules/shared/style/cn';
import { Badge } from '@/modules/ui/components/badge';
import { Button } from '@/modules/ui/components/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/modules/ui/components/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/modules/ui/components/select';
import { createToast } from '@/modules/ui/components/sonner';
import { TextField, TextFieldRoot } from '@/modules/ui/components/textfield';
import { createSubscription, deleteSubscription, fetchSubscriptions, updateSubscription } from '../finances.services';

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
  };
}

const SubscriptionFormDialog: Component<{
  isOpen: boolean;
  onClose: () => void;
  onSave: (data: FormState) => void;
  initial?: Subscription;
  isPending: boolean;
}> = (props) => {
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
      }
    : defaultForm();

  const [form, setForm] = createSignal<FormState>(getInitialForm());
  const set = (key: keyof FormState, value: string | null) =>
    setForm(prev => ({ ...prev, [key]: value }));

  return (
    <Dialog open={props.isOpen} onOpenChange={open => !open && props.onClose()}>
      <DialogContent class="max-w-md">
        <DialogHeader>
          <DialogTitle>{props.initial ? 'Edit subscription' : 'Add subscription'}</DialogTitle>
        </DialogHeader>

        <div class="flex flex-col gap-3 mt-2">
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

          <div class="flex gap-2 justify-end mt-2">
            <Button variant="outline" onClick={props.onClose}>Cancel</Button>
            <Button
              disabled={props.isPending || !form().name || !form().amount}
              onClick={() => props.onSave(form())}
            >
              {props.initial ? 'Save changes' : 'Add subscription'}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
};

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

      <div class="p-6 pb-32 max-w-4xl mx-auto w-full overflow-y-auto flex-1">

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

      {/* List */}
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
        <div class="border rounded-lg divide-y divide-border">
          <For each={subsQuery.data?.subscriptions}>
            {sub => (
              <div class={cn('flex items-center gap-3 px-4 py-3', !sub.isActive && 'opacity-50')}>
                <div class="flex-1 min-w-0">
                  <div class="flex items-center gap-2">
                    <span class="font-medium truncate">{sub.name}</span>
                    <Show when={!sub.isActive}>
                      <Badge variant="outline" class="text-xs text-muted-foreground">Paused</Badge>
                    </Show>
                    <Show when={sub.category}>
                      <Badge variant="outline" class="text-xs">{sub.category}</Badge>
                    </Show>
                  </div>
                  <div class="text-xs text-muted-foreground mt-0.5">
                    {BILLING_CYCLES.find(c => c.value === sub.billingCycle)?.label ?? sub.billingCycle}
                    {sub.nextPaymentAt && ` · Next: ${formatDate(sub.nextPaymentAt)}`}
                  </div>
                </div>

                <div class="text-right shrink-0">
                  <div class="font-medium">{formatCurrency(sub.amount, sub.currency)}</div>
                  <Show when={sub.billingCycle !== 'monthly'}>
                    <div class="text-xs text-muted-foreground">
                      {formatCurrency(toMonthlyAmount(sub.amount, sub.billingCycle))}
                      /mo
                    </div>
                  </Show>
                </div>

                <div class="flex gap-1 shrink-0">
                  <Button
                    size="sm"
                    variant="ghost"
                    title={sub.isActive ? 'Pause' : 'Resume'}
                    onClick={() => toggleMut.mutate({ id: sub.id, isActive: !sub.isActive })}
                  >
                    <div class={cn(sub.isActive ? 'i-tabler-player-pause' : 'i-tabler-player-play', 'size-4')} />
                  </Button>
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() => openEditDialog(sub)}
                  >
                    <div class="i-tabler-pencil size-4" />
                  </Button>
                  <Button
                    size="sm"
                    variant="ghost"
                    class="text-destructive hover:text-destructive"
                    onClick={() => triggerDelete(sub)}
                  >
                    <div class="i-tabler-trash size-4" />
                  </Button>
                </div>
              </div>
            )}
          </For>
        </div>
      </Show>

      <Show when={dialogOpen()}>
        <SubscriptionFormDialog
          isOpen={dialogOpen()}
          onClose={closeDialog}
          initial={editingSub()}
          isPending={createMut.isPending || updateMut.isPending}
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
