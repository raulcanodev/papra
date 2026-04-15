import type { Component } from 'solid-js';
import { A, useParams } from '@solidjs/router';
import { useQuery } from '@tanstack/solid-query';
import { For, Show } from 'solid-js';
import { cn } from '@/modules/shared/style/cn';
import { Badge } from '@/modules/ui/components/badge';
import { Button } from '@/modules/ui/components/button';
import { fetchBankConnections, fetchOverviewStats } from '../finances.services';

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

function formatCurrency(amount: number, currency = 'USD') {
  return new Intl.NumberFormat('en-US', { style: 'currency', currency, minimumFractionDigits: 0, maximumFractionDigits: 0 }).format(amount);
}

function formatMonth(ym: string) {
  const [year, month] = ym.split('-');
  return new Date(Number(year), Number(month) - 1, 1).toLocaleString('en-US', { month: 'short', year: '2-digit' });
}

const StatCard: Component<{ label: string; value: string; icon: string; description?: string; class?: string }> = (props) => {
  return (
    <div class={cn('border rounded-lg p-4 flex flex-col gap-1', props.class)}>
      <div class="flex items-center gap-2 text-muted-foreground text-xs">
        <div class={cn(props.icon, 'size-4')} />
        {props.label}
      </div>
      <div class="text-2xl font-bold">{props.value}</div>
      <Show when={props.description}>
        <div class="text-xs text-muted-foreground">{props.description}</div>
      </Show>
    </div>
  );
};

export const OverviewPage: Component = () => {
  const params = useParams();

  const overviewQuery = useQuery(() => ({
    queryKey: ['organizations', params.organizationId, 'finances', 'overview'],
    queryFn: () => fetchOverviewStats({ organizationId: params.organizationId }),
  }));

  const connectionsQuery = useQuery(() => ({
    queryKey: ['organizations', params.organizationId, 'finances', 'bank-connections'],
    queryFn: () => fetchBankConnections({ organizationId: params.organizationId }),
  }));

  const hasData = () => (overviewQuery.data?.monthlySummary?.length ?? 0) > 0;
  const hasConnections = () => (connectionsQuery.data?.bankConnections?.length ?? 0) > 0;

  // Stats for the current/most-recent month
  const currentMonthStats = () => {
    const summary = overviewQuery.data?.monthlySummary ?? [];
    return summary[summary.length - 1];
  };

  const totalBreakdownAmount = () =>
    overviewQuery.data?.classificationBreakdown.reduce((sum, b) => sum + b.total, 0) ?? 0;

  // Bar chart helpers
  const maxBarValue = () => {
    const summary = overviewQuery.data?.monthlySummary ?? [];
    return Math.max(...summary.flatMap(m => [m.income, m.expenses]), 1);
  };

  return (
    <div class="p-6 mt-4 pb-32 max-w-6xl mx-auto">
      <div class="flex items-center justify-between mb-6">
        <div>
          <h2 class="text-xl font-bold">Overview</h2>
          <p class="text-muted-foreground text-sm mt-1">Last 6 months of financial activity</p>
        </div>
      </div>

      <Show
        when={hasConnections()}
        fallback={(
          <div class="text-center py-16">
            <div class="i-tabler-chart-bar size-12 mx-auto text-muted-foreground opacity-40 mb-4" />
            <h3 class="text-lg font-medium mb-1">No data yet</h3>
            <p class="text-muted-foreground text-sm mb-4">Connect a bank account to start tracking your finances.</p>
            <Button as={A} href={`/organizations/${params.organizationId}/finances/transactions`} variant="outline">
              Go to Transactions
            </Button>
          </div>
        )}
      >
        {/* Stat cards */}
        <div class="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-6">
          <StatCard
            label="Income (this month)"
            value={formatCurrency(currentMonthStats()?.income ?? 0)}
            icon="i-tabler-trending-up"
            class="border-green-500/20"
          />
          <StatCard
            label="Expenses (this month)"
            value={formatCurrency(currentMonthStats()?.expenses ?? 0)}
            icon="i-tabler-trending-down"
            class="border-red-500/20"
          />
          <StatCard
            label="Net (this month)"
            value={formatCurrency((currentMonthStats()?.income ?? 0) - (currentMonthStats()?.expenses ?? 0))}
            icon="i-tabler-scale"
          />
          <StatCard
            label="Unclassified"
            value={String(overviewQuery.data?.unclassifiedCount ?? 0)}
            icon="i-tabler-question-mark"
            description="transactions need review"
            class={(overviewQuery.data?.unclassifiedCount ?? 0) > 0 ? 'border-yellow-500/20' : ''}
          />
        </div>

        <Show when={hasData()}>
          {/* Monthly bar chart */}
          <div class="border rounded-lg p-4 mb-6">
            <h3 class="text-sm font-semibold mb-4">Income vs Expenses — last 6 months</h3>
            <div class="flex items-end gap-3 h-40">
              <For each={overviewQuery.data?.monthlySummary}>
                {(entry) => {
                  const incomeHeight = () => `${Math.round((entry.income / maxBarValue()) * 100)}%`;
                  const expenseHeight = () => `${Math.round((entry.expenses / maxBarValue()) * 100)}%`;
                  return (
                    <div class="flex-1 flex flex-col items-center gap-1 min-w-0">
                      <div class="w-full flex items-end gap-0.5 h-32">
                        <div
                          class="flex-1 bg-green-500/40 rounded-t transition-all"
                          style={{ height: incomeHeight() }}
                          title={`Income: ${formatCurrency(entry.income)}`}
                        />
                        <div
                          class="flex-1 bg-red-500/40 rounded-t transition-all"
                          style={{ height: expenseHeight() }}
                          title={`Expenses: ${formatCurrency(entry.expenses)}`}
                        />
                      </div>
                      <span class="text-xs text-muted-foreground truncate w-full text-center">{formatMonth(entry.month)}</span>
                    </div>
                  );
                }}
              </For>
            </div>
            <div class="flex gap-4 mt-2 text-xs text-muted-foreground">
              <div class="flex items-center gap-1">
                <div class="size-3 rounded-sm bg-green-500/40" />
                {' Income'}
              </div>
              <div class="flex items-center gap-1">
                <div class="size-3 rounded-sm bg-red-500/40" />
                {' Expenses'}
              </div>
            </div>
          </div>

          {/* Classification breakdown */}
          <Show when={(overviewQuery.data?.classificationBreakdown?.length ?? 0) > 0}>
            <div class="border rounded-lg p-4">
              <h3 class="text-sm font-semibold mb-4">Breakdown by category — last 6 months</h3>
              <div class="flex flex-col gap-3">
                <For each={overviewQuery.data?.classificationBreakdown}>
                  {(entry) => {
                    const pct = () => totalBreakdownAmount() > 0
                      ? Math.round((entry.total / totalBreakdownAmount()) * 100)
                      : 0;
                    const label = entry.classification
                      ? (classificationLabels[entry.classification] ?? entry.classification)
                      : 'Unclassified';
                    return (
                      <div class="flex items-center gap-3">
                        <Badge variant="outline" class={cn('text-xs w-36 justify-center shrink-0', entry.classification ? classificationColors[entry.classification] : 'text-muted-foreground')}>
                          {label}
                        </Badge>
                        <div class="flex-1 h-2 bg-muted rounded-full overflow-hidden">
                          <div
                            class="h-full bg-primary/50 rounded-full transition-all"
                            style={{ width: `${pct()}%` }}
                          />
                        </div>
                        <span class="text-sm font-medium w-20 text-right shrink-0">{formatCurrency(entry.total)}</span>
                        <span class="text-xs text-muted-foreground w-8 text-right shrink-0">
                          {pct()}
                          {'%'}
                        </span>
                      </div>
                    );
                  }}
                </For>
              </div>
            </div>
          </Show>
        </Show>
      </Show>
    </div>
  );
};
