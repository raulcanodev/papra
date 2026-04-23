import type { Component } from 'solid-js';
import type { Transaction } from '../finances.types';
import { For, Show } from 'solid-js';
import { useQuery } from '@tanstack/solid-query';
import { TransactionCustomPropertiesPanel } from '@/modules/custom-properties/components/transaction-custom-properties-panel.component';
import { fetchCustomPropertyDefinitions } from '@/modules/custom-properties/custom-properties.services';
import { TransactionTagsList } from '@/modules/tags/components/tag-list.component';
import { Badge } from '@/modules/ui/components/badge';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/modules/ui/components/dialog';
import { fetchTransactionCustomProperties } from '../finances.services';

const classificationColors: Record<string, string> = {
  expense: 'bg-red-500/10 text-red-600 border-red-500/20',
  income: 'bg-green-500/10 text-green-600 border-green-500/20',
  owner_transfer: 'bg-blue-500/10 text-blue-600 border-blue-500/20',
  internal_transfer: 'bg-purple-500/10 text-purple-600 border-purple-500/20',
};

const classificationLabels: Record<string, string> = {
  expense: 'Expense',
  income: 'Income',
  owner_transfer: 'Owner Transfer',
  internal_transfer: 'Internal Transfer',
};

function formatCurrency(amount: number, currency: string) {
  return new Intl.NumberFormat('en-US', { style: 'currency', currency, minimumFractionDigits: 2 }).format(amount);
}

function formatDate(date: Date | string) {
  return new Intl.DateTimeFormat('en-US', { year: 'numeric', month: 'long', day: 'numeric', hour: '2-digit', minute: '2-digit' }).format(new Date(date));
}

export const TransactionDetailDialog: Component<{
  transaction: Transaction | null;
  isOpen: boolean;
  onClose: () => void;
  organizationId: string;
}> = (props) => {
  const rawDataParsed = () => {
    if (!props.transaction?.rawData) {
      return null;
    }
    try {
      return JSON.parse(props.transaction.rawData) as Record<string, unknown>;
    } catch {
      return null;
    }
  };

  const flattenRawData = (data: Record<string, unknown>): Array<{ key: string; value: string }> => {
    const rows: Array<{ key: string; value: string }> = [];

    function walk(obj: Record<string, unknown>, prefix: string) {
      for (const [k, v] of Object.entries(obj)) {
        const fullKey = prefix ? `${prefix}.${k}` : k;
        if (v === null || v === undefined) {
          rows.push({ key: fullKey, value: '—' });
        } else if (Array.isArray(v)) {
          rows.push({ key: fullKey, value: v.length === 0 ? '[]' : JSON.stringify(v) });
        } else if (typeof v === 'object') {
          walk(v as Record<string, unknown>, fullKey);
        } else {
          rows.push({ key: fullKey, value: String(v) });
        }
      }
    }

    walk(data, '');
    return rows;
  };

  const customPropsQuery = useQuery(() => ({
    queryKey: ['organizations', props.organizationId, 'finances', 'transactions', props.transaction?.id, 'custom-properties'],
    queryFn: () => fetchTransactionCustomProperties({ organizationId: props.organizationId, transactionId: props.transaction!.id }),
    enabled: !!props.transaction?.id && props.isOpen,
  }));

  const propertyDefsQuery = useQuery(() => ({
    queryKey: ['organizations', props.organizationId, 'custom-properties', 'definitions'],
    queryFn: () => fetchCustomPropertyDefinitions({ organizationId: props.organizationId }),
    enabled: props.isOpen,
  }));


  return (
    <Dialog open={props.isOpen} onOpenChange={open => !open && props.onClose()}>
      <DialogContent class="max-w-lg">
        <DialogHeader>
          <DialogTitle>Transaction Details</DialogTitle>
        </DialogHeader>

        <Show when={props.transaction}>
          {txn => (
            <div class="flex flex-col gap-3 mt-4">
              <div class="grid grid-cols-2 gap-3">
                <div>
                  <div class="text-xs text-muted-foreground mb-0.5">Date</div>
                  <div class="text-sm font-medium">{formatDate(txn().date)}</div>
                </div>
                <div>
                  <div class="text-xs text-muted-foreground mb-0.5">Amount</div>
                  <div class={`text-sm font-mono font-medium ${txn().amount < 0 ? 'text-red-500' : 'text-green-600'}`}>
                    {formatCurrency(txn().amount, txn().currency)}
                  </div>
                </div>
                <div class="col-span-2">
                  <div class="text-xs text-muted-foreground mb-0.5">Description</div>
                  <div class="text-sm">{txn().description}</div>
                </div>
                <div>
                  <div class="text-xs text-muted-foreground mb-0.5">Counterparty</div>
                  <div class="text-sm">{txn().counterparty ?? '—'}</div>
                </div>
                <div>
                  <div class="text-xs text-muted-foreground mb-0.5">Status</div>
                  <div class="text-sm capitalize">{txn().status}</div>
                </div>
                <div>
                  <div class="text-xs text-muted-foreground mb-0.5">Provider</div>
                  <div class="text-sm capitalize">{txn().provider}</div>
                </div>
                <div>
                  <div class="text-xs text-muted-foreground mb-0.5">Classification</div>
                  <Show when={txn().classification} fallback={<span class="text-sm text-muted-foreground">Unclassified</span>}>
                    <Badge class={classificationColors[txn().classification!]}>
                      {classificationLabels[txn().classification!] ?? txn().classification}
                    </Badge>
                  </Show>
                </div>
              </div>

              <Show when={(txn().tags ?? []).length > 0}>
                <div>
                  <div class="text-xs text-muted-foreground mb-1">Tags</div>
                  <TransactionTagsList
                    tags={txn().tags ?? []}
                    transactionId={txn().id}
                    organizationId={props.organizationId}
                  />
                </div>
              </Show>
              <Show when={!(txn().tags ?? []).length}>
                <div>
                  <div class="text-xs text-muted-foreground mb-0.5">Tags</div>
                  <TransactionTagsList
                    tags={[]}
                    transactionId={txn().id}
                    organizationId={props.organizationId}
                  />
                </div>
              </Show>

              <Show when={(propertyDefsQuery.data?.propertyDefinitions ?? []).filter(d => d.type !== 'user_relation' && d.type !== 'document_relation').length > 0}>
                <div class="grid grid-cols-[auto_1fr] gap-x-2 gap-y-0.5">
                  <TransactionCustomPropertiesPanel
                    transactionId={txn().id}
                    organizationId={props.organizationId}
                    propertyDefinitions={propertyDefsQuery.data?.propertyDefinitions ?? []}
                    values={customPropsQuery.data?.values ?? []}
                  />
                </div>
              </Show>

              <Show when={rawDataParsed()}>
                {data => (
                  <div>
                    <div class="text-xs text-muted-foreground mb-1.5 mt-2">Raw Provider Data</div>
                    <div class="bg-muted rounded-lg p-3 max-h-60 overflow-y-auto">
                      <table class="w-full text-xs">
                        <tbody>
                          <For each={flattenRawData(data())}>
                            {row => (
                              <tr class="border-b border-border/50 last:border-0">
                                <td class="py-1 pr-3 text-muted-foreground font-mono whitespace-nowrap align-top">{row.key}</td>
                                <td class="py-1 font-mono break-all">{row.value}</td>
                              </tr>
                            )}
                          </For>
                        </tbody>
                      </table>
                    </div>
                  </div>
                )}
              </Show>
            </div>
          )}
        </Show>
      </DialogContent>
    </Dialog>
  );
};
