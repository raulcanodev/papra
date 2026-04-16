import type { Component } from 'solid-js';
import type { Transaction } from '../finances.types';
import { useParams } from '@solidjs/router';
import { createMutation, keepPreviousData, useQuery, useQueryClient } from '@tanstack/solid-query';
import { createSignal, For, Show } from 'solid-js';
import { useConfirmModal } from '@/modules/shared/confirm';
import { PaginationControls } from '@/modules/shared/pagination/pagination-controls.component';
import { createParamSynchronizedPagination } from '@/modules/shared/pagination/query-synchronized-pagination';
import { cn } from '@/modules/shared/style/cn';
import { Badge } from '@/modules/ui/components/badge';
import { Button } from '@/modules/ui/components/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/modules/ui/components/select';
import { createToast } from '@/modules/ui/components/sonner';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/modules/ui/components/table';
import { AddBankConnectionDialog } from '../components/add-bank-connection-dialog.component';
import { EditBankConnectionDialog } from '../components/edit-bank-connection-dialog.component';
import { TransactionDetailDialog } from '../components/transaction-detail-dialog.component';
import { deleteBankConnection, fetchBankConnections, fetchTransactions, syncBankConnection, updateTransactionClassification } from '../finances.services';
import { privacyCurrency, privacyText, usePrivacyMode } from '../privacy-mode';

const classificationOptions = [
  { value: 'expense', label: 'Expense' },
  { value: 'income', label: 'Income' },
  { value: 'owner_transfer', label: 'Owner Transfer' },
  { value: 'internal_transfer', label: 'Internal Transfer' },
];

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

function formatCurrencyRaw(amount: number, currency: string) {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency,
    minimumFractionDigits: 2,
  }).format(amount);
}

function formatDate(date: Date | string) {
  return new Intl.DateTimeFormat('en-US', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  }).format(new Date(date));
}

export const FinancesPage: Component = () => {
  const params = useParams();
  const queryClient = useQueryClient();
  const { confirm } = useConfirmModal();
  const { isPrivacyMode, togglePrivacyMode } = usePrivacyMode();
  const formatCurrency = (amount: number, currency: string) => privacyCurrency(formatCurrencyRaw(amount, currency), isPrivacyMode());
  const [getPagination, setPagination] = createParamSynchronizedPagination();
  const [getFilterConnection, setFilterConnection] = createSignal<string | undefined>();
  const [getFilterClassification, setFilterClassification] = createSignal<string | undefined>();
  const [getEditingConnection, setEditingConnection] = createSignal<string | undefined>();
  const [getDetailTransaction, setDetailTransaction] = createSignal<Transaction | null>(null);

  const connectionsQuery = useQuery(() => ({
    queryKey: ['organizations', params.organizationId, 'finances', 'bank-connections'],
    queryFn: () => fetchBankConnections({ organizationId: params.organizationId }),
  }));

  const transactionsQuery = useQuery(() => ({
    queryKey: ['organizations', params.organizationId, 'finances', 'transactions', getPagination(), getFilterConnection(), getFilterClassification()],
    queryFn: () => fetchTransactions({
      organizationId: params.organizationId,
      ...getPagination(),
      bankConnectionId: getFilterConnection(),
      classification: getFilterClassification(),
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
      createToast({ message: `Synced ${data.insertedCount} new transactions`, type: 'success' });
      queryClient.invalidateQueries({ queryKey: ['organizations', params.organizationId, 'finances'] });
    },
    onError: () => {
      createToast({ message: 'Failed to sync transactions', type: 'error' });
    },
  }));

  const deleteMutation = createMutation(() => ({
    mutationFn: (bankConnectionId: string) => deleteBankConnection({
      organizationId: params.organizationId,
      bankConnectionId,
    }),
    onSuccess: () => {
      createToast({ message: 'Bank connection deleted', type: 'success' });
      queryClient.invalidateQueries({ queryKey: ['organizations', params.organizationId, 'finances'] });
    },
    onError: () => {
      createToast({ message: 'Failed to delete bank connection', type: 'error' });
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

  const allAccountsOption = { value: undefined as string | undefined, label: 'All accounts' };
  const allTypesOption = { value: undefined as string | undefined, label: 'All types' };

  return (
    <div class="p-6 mt-4 pb-32 max-w-6xl mx-auto">
      <div class="flex items-center justify-between mb-6">
        <div>
          <h2 class="text-xl font-bold">LLC Finances</h2>
          <p class="text-muted-foreground text-sm mt-1">Bank transactions & Form 5472 classification</p>
          <p class="text-muted-foreground text-xs mt-0.5">Accounts sync automatically every day at 2:00 AM</p>
        </div>
        <Show when={(connectionsQuery.data?.bankConnections?.length ?? 0) > 0}>
          <div class="flex gap-2">
            <Button variant="ghost" size="sm" onClick={togglePrivacyMode} title={isPrivacyMode() ? 'Show values' : 'Hide values'}>
              <div class={cn(isPrivacyMode() ? 'i-tabler-eye-off' : 'i-tabler-eye', 'size-5')} />
            </Button>

            <AddBankConnectionDialog organizationId={params.organizationId} />
          </div>
        </Show>
      </div>

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
                >
                  <div class="i-tabler-pencil size-4" />
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => syncMutation.mutate({ bankConnectionId: connection.id })}
                  disabled={syncMutation.isPending}
                  title="Sync new transactions"
                >
                  <div class={cn('i-tabler-refresh size-4', syncMutation.isPending && 'animate-spin')} />
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => syncMutation.mutate({ bankConnectionId: connection.id, fullSync: true })}
                  disabled={syncMutation.isPending}
                  title="Full sync — re-fetch all transactions"
                >
                  <div class={cn('i-tabler-cloud-download size-4', syncMutation.isPending && 'animate-spin')} />
                </Button>
                <Button
                  size="sm"
                  variant="ghost"
                  class="text-destructive hover:text-destructive"
                  onClick={async () => {
                    const ok = await confirm({
                      title: 'Delete bank connection',
                      message: `Delete "${connection.name}"? This will also delete all its transactions.`,
                      confirmButton: { text: 'Delete', variant: 'destructive' },
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
        <div class="flex gap-3 mb-4 flex-wrap">
          <Select
            options={[allAccountsOption, ...(connectionsQuery.data?.bankConnections ?? []).map(c => ({ value: c.id as string | undefined, label: c.name }))]}
            optionValue="value"
            optionTextValue="label"
            value={getFilterConnection()
              ? { value: getFilterConnection(), label: connectionsQuery.data?.bankConnections?.find(c => c.id === getFilterConnection())?.name ?? '' }
              : allAccountsOption}
            onChange={v => setFilterConnection(v?.value)}
            itemComponent={prps => <SelectItem item={prps.item}>{prps.item.rawValue.label}</SelectItem>}
          >
            <SelectTrigger class="w-48">
              <SelectValue<{ value: string | undefined; label: string }>>{state => state.selectedOption()?.label ?? 'All accounts'}</SelectValue>
            </SelectTrigger>
            <SelectContent />
          </Select>

          <Select
            options={[allTypesOption, ...classificationOptions.map(c => ({ value: c.value as string | undefined, label: c.label }))]}
            optionValue="value"
            optionTextValue="label"
            value={getFilterClassification()
              ? { value: getFilterClassification(), label: classificationOptions.find(c => c.value === getFilterClassification())?.label ?? '' }
              : allTypesOption}
            onChange={v => setFilterClassification(v?.value)}
            itemComponent={prps => <SelectItem item={prps.item}>{prps.item.rawValue.label}</SelectItem>}
          >
            <SelectTrigger class="w-48">
              <SelectValue<{ value: string | undefined; label: string }>>{state => state.selectedOption()?.label ?? 'All types'}</SelectValue>
            </SelectTrigger>
            <SelectContent />
          </Select>
        </div>
      </Show>



      {/* Transactions table */}
      <Show
        when={(transactionsQuery.data?.transactions?.length ?? 0) > 0}
        fallback={(
          <Show when={(connectionsQuery.data?.bankConnections?.length ?? 0) === 0}>
            <div class="text-center py-16">
              <div class="i-tabler-building-bank size-12 mx-auto text-muted-foreground opacity-40 mb-4" />
              <h3 class="text-lg font-medium mb-1">No bank accounts connected</h3>
              <p class="text-muted-foreground text-sm mb-4">Connect your Mercury or Wise account to start tracking transactions.</p>
              <AddBankConnectionDialog organizationId={params.organizationId} />
            </div>
          </Show>
        )}
      >
        <div class="border rounded-lg">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead class="w-8" />
                <TableHead>Date</TableHead>
                <TableHead>Description</TableHead>
                <TableHead>Counterparty</TableHead>
                <TableHead class="text-right">Amount</TableHead>
                <TableHead>Account</TableHead>
                <TableHead>Tags</TableHead>
                <TableHead>Classification</TableHead>
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
                      <Select
                        options={[
                          { value: null as string | null, label: 'Unclassified' },
                          ...classificationOptions.map(c => ({ value: c.value as string | null, label: c.label })),
                        ]}
                        optionValue="value"
                        optionTextValue="label"
                        value={
                          transaction.classification
                            ? classificationOptions.map(c => ({ value: c.value as string | null, label: c.label })).find(c => c.value === transaction.classification)
                            : { value: null, label: 'Unclassified' }
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
                            {state => state.selectedOption()?.label ?? 'Unclassified'}
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
  );
};
