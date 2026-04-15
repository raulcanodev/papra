import type { Component } from 'solid-js';
import type { Transaction } from '../finances.types';
import { For, Show } from 'solid-js';
import { Badge } from '@/modules/ui/components/badge';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/modules/ui/components/dialog';

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

              <Show when={rawDataParsed()}>
                {data => (
                  <div>
                    <div class="text-xs text-muted-foreground mb-1.5 mt-2">Raw Provider Data</div>
                    <div class="bg-muted rounded-lg p-3 max-h-60 overflow-y-auto">
                      <table class="w-full text-xs">
                        <tbody>
                          <For each={Object.entries(data())}>
                            {([key, value]) => (
                              <tr class="border-b border-border/50 last:border-0">
                                <td class="py-1 pr-3 text-muted-foreground font-mono whitespace-nowrap align-top">{key}</td>
                                <td class="py-1 font-mono break-all">
                                  {typeof value === 'object' ? JSON.stringify(value, null, 2) : String(value ?? '—')}
                                </td>
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
