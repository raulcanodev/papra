import type { Component } from 'solid-js';
import { A, useParams } from '@solidjs/router';
import { useQuery } from '@tanstack/solid-query';
import { For, Show } from 'solid-js';
import { getDocumentLocale } from '@/modules/i18n/document-locale';
import { useI18n } from '@/modules/i18n/i18n.provider';
import { cn } from '@/modules/shared/style/cn';
import { Badge } from '@/modules/ui/components/badge';
import { Button } from '@/modules/ui/components/button';
import { getClassificationLabelKey } from '../finances-labels';
import { fetchBankConnections, fetchOverviewStats } from '../finances.services';
import { privacyCurrency, usePrivacyMode } from '../privacy-mode';

const classificationColors: Record<string, string> = {
  expense: 'bg-red-500/10 text-red-600 border-red-500/20',
  income: 'bg-green-500/10 text-green-600 border-green-500/20',
  owner_transfer: 'bg-blue-500/10 text-blue-600 border-blue-500/20',
  internal_transfer: 'bg-purple-500/10 text-purple-600 border-purple-500/20',
};

function formatCurrencyRaw(amount: number, currency = 'USD') {
  return new Intl.NumberFormat(getDocumentLocale(), { style: 'currency', currency, minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(amount);
}

function formatCurrencyCompactRaw(amount: number, currency = 'USD') {
  return new Intl.NumberFormat(getDocumentLocale(), { style: 'currency', currency, minimumFractionDigits: 0, maximumFractionDigits: 0 }).format(amount);
}

function formatMonth(ym: string) {
  const [year, month] = ym.split('-');
  return new Date(Number(year), Number(month) - 1, 1).toLocaleString(getDocumentLocale(), { month: 'short', year: '2-digit' });
}

const providerIcons: Record<string, string> = {
  mercury: 'i-tabler-brand-mercury',
  wise: 'i-tabler-world',
};

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
  const { t } = useI18n();
  const params = useParams();
  const { isPrivacyMode, togglePrivacyMode } = usePrivacyMode();

  const formatCurrency = (amount: number, currency = 'USD') => privacyCurrency(formatCurrencyRaw(amount, currency), isPrivacyMode());
  const formatCurrencyCompact = (amount: number, currency = 'USD') => privacyCurrency(formatCurrencyCompactRaw(amount, currency), isPrivacyMode());

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

  const currentMonthStats = () => {
    const summary = overviewQuery.data?.monthlySummary ?? [];
    return summary[summary.length - 1];
  };

  const totalBreakdownAmount = () =>
    overviewQuery.data?.classificationBreakdown.reduce((sum, b) => sum + b.total, 0) ?? 0;

  const maxBarValue = () => {
    const summary = overviewQuery.data?.monthlySummary ?? [];
    return Math.max(...summary.flatMap(m => [m.income, m.expenses]), 1);
  };

  const hasMultipleCurrencies = () => {
    const balances = overviewQuery.data?.accountBalances ?? [];
    const currencies = new Set(balances.map(b => b.currency));
    return currencies.size > 1;
  };

  const getConvertedBalance = (balance: number, currency: string) => {
    const displayCurrency = overviewQuery.data?.totalBalanceCurrency ?? 'USD';
    if (currency === displayCurrency) {
      return null;
    }
    const rate = overviewQuery.data?.exchangeRates?.[currency];
    if (rate == null) {
      return null;
    }
    return { amount: balance * rate, currency: displayCurrency };
  };

  return (
    <div class="page">
      {/* Header */}
      <div class="page-header">
        <div>
          <h1 class="page-title">{t('finances.overview.title')}</h1>
          <p class="page-description">{t('finances.overview.description')}</p>
        </div>
        <Button variant="ghost" size="sm" onClick={togglePrivacyMode} title={isPrivacyMode() ? t('finances.privacy.show') : t('finances.privacy.hide')}>
          <div class={cn(isPrivacyMode() ? 'i-tabler-eye-off' : 'i-tabler-eye', 'size-4')} />
        </Button>
      </div>

      <div>

        <Show
          when={hasConnections()}
          fallback={(
            <div class="text-center py-16">
              <div class="i-tabler-chart-bar size-12 mx-auto text-muted-foreground opacity-40 mb-4" />
              <h3 class="text-lg font-medium mb-1">{t('finances.overview.empty.title')}</h3>
              <p class="text-muted-foreground text-sm mb-4">{t('finances.overview.empty.description')}</p>
              <Button as={A} href={`/organizations/${params.organizationId}/finances/transactions`} variant="outline">
                {t('finances.overview.empty.action')}
              </Button>
            </div>
          )}
        >
          {/* Total Balance Hero */}
          <Show when={(overviewQuery.data?.accountBalances?.length ?? 0) > 0}>
            <div class="border rounded-xl p-6 mb-6 bg-gradient-to-br from-primary/5 to-transparent">
              <div class="flex flex-col md:flex-row md:items-end md:justify-between gap-4">
                <div>
                  <div class="text-sm text-muted-foreground mb-1">{t('finances.overview.total-balance')}</div>
                  <div class={cn('text-4xl font-bold tracking-tight', (overviewQuery.data?.totalBalance ?? 0) >= 0 ? 'text-foreground' : 'text-red-600')}>
                    <Show
                      when={overviewQuery.data?.totalBalanceEur != null}
                      fallback={formatCurrency(overviewQuery.data?.totalBalance ?? 0, overviewQuery.data?.totalBalanceCurrency)}
                    >
                      {formatCurrency(overviewQuery.data?.totalBalanceEur ?? 0, 'EUR')}
                    </Show>
                  </div>
                  <Show when={overviewQuery.data?.totalBalanceUsd != null}>
                    <div class="text-sm text-muted-foreground/60 font-mono mt-0.5">
                      (
                      {formatCurrency(overviewQuery.data?.totalBalanceUsd ?? 0, 'USD')}
                      )
                    </div>
                  </Show>
                  <Show when={hasMultipleCurrencies()}>
                    <div class="text-xs text-muted-foreground mt-1">
                      {t('finances.overview.converted', { currency: overviewQuery.data?.totalBalanceCurrency ?? '' })}
                    </div>
                  </Show>
                </div>

                {/* Per-account breakdown */}
                <div class="flex flex-col gap-2 md:items-end">
                  <For each={overviewQuery.data?.accountBalances}>
                    {(account) => {
                      const converted = () => getConvertedBalance(account.balance, account.currency);
                      return (
                        <div class="flex items-center gap-3">
                          <div class="flex items-center gap-2 min-w-0">
                            <div class={cn(providerIcons[account.provider] ?? 'i-tabler-building-bank', 'size-4 text-muted-foreground shrink-0')} />
                            <span class="text-sm text-muted-foreground truncate">{account.bankConnectionName}</span>
                          </div>
                          <div class="flex items-baseline gap-1.5 shrink-0">
                            <span class={cn('text-sm font-semibold', account.balance >= 0 ? 'text-foreground' : 'text-red-600')}>
                              {formatCurrency(account.balance, account.currency)}
                            </span>
                            <Show when={converted()}>
                              {conv => (
                                <span class="text-xs text-muted-foreground">
                                  ≈
                                  {' '}
                                  {formatCurrency(conv().amount, conv().currency)}
                                </span>
                              )}
                            </Show>
                          </div>
                        </div>
                      );
                    }}
                  </For>
                </div>
              </div>
            </div>
          </Show>

          {/* Monthly stat cards */}
          <div class="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-6">
            <StatCard
              label={t('finances.overview.stats.income')}
              value={formatCurrencyCompact(currentMonthStats()?.income ?? 0)}
              icon="i-tabler-trending-up"
              class="border-green-500/20"
            />
            <StatCard
              label={t('finances.overview.stats.expenses')}
              value={formatCurrencyCompact(currentMonthStats()?.expenses ?? 0)}
              icon="i-tabler-trending-down"
              class="border-red-500/20"
            />
            <StatCard
              label={t('finances.overview.stats.net')}
              value={formatCurrencyCompact((currentMonthStats()?.income ?? 0) - (currentMonthStats()?.expenses ?? 0))}
              icon="i-tabler-scale"
            />
            <StatCard
              label={t('finances.overview.stats.unclassified')}
              value={String(overviewQuery.data?.unclassifiedCount ?? 0)}
              icon="i-tabler-question-mark"
              description={t('finances.overview.stats.unclassified.description')}
              class={(overviewQuery.data?.unclassifiedCount ?? 0) > 0 ? 'border-yellow-500/20' : ''}
            />
          </div>

          <Show when={hasData()}>
            {/* Monthly bar chart */}
            <div class="border rounded-lg p-4 mb-6">
              <h3 class="text-sm font-semibold mb-4">{t('finances.overview.chart.title')}</h3>
              <div class="flex items-end gap-3 h-48">
                <For each={overviewQuery.data?.monthlySummary}>
                  {(entry) => {
                    const incomeHeight = () => `${Math.round((entry.income / maxBarValue()) * 100)}%`;
                    const expenseHeight = () => `${Math.round((entry.expenses / maxBarValue()) * 100)}%`;
                    return (
                      <div class="flex-1 flex flex-col items-center gap-1 min-w-0">
                        <div class="w-full flex items-end gap-0.5 h-36">
                          <div class="flex-1 h-full flex flex-col items-center justify-end">
                            <span class="text-[10px] font-medium text-green-600 mb-0.5 truncate w-full text-center">{formatCurrencyCompact(entry.income)}</span>
                            <div
                              class="w-full bg-green-500/40 rounded-t transition-all"
                              style={{ height: incomeHeight() }}
                            />
                          </div>
                          <div class="flex-1 h-full flex flex-col items-center justify-end">
                            <span class="text-[10px] font-medium text-red-500 mb-0.5 truncate w-full text-center">{formatCurrencyCompact(entry.expenses)}</span>
                            <div
                              class="w-full bg-red-500/40 rounded-t transition-all"
                              style={{ height: expenseHeight() }}
                            />
                          </div>
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
                  {` ${t('finances.overview.chart.income')}`}
                </div>
                <div class="flex items-center gap-1">
                  <div class="size-3 rounded-sm bg-red-500/40" />
                  {` ${t('finances.overview.chart.expenses')}`}
                </div>
              </div>
            </div>

            {/* Classification breakdown */}
            <Show when={(overviewQuery.data?.classificationBreakdown?.length ?? 0) > 0}>
              <div class="border rounded-lg p-4">
                <h3 class="text-sm font-semibold mb-4">{t('finances.overview.breakdown.title')}</h3>
                <div class="flex flex-col gap-3">
                  <For each={overviewQuery.data?.classificationBreakdown}>
                    {(entry) => {
                      const pct = () => totalBreakdownAmount() > 0
                        ? Math.round((entry.total / totalBreakdownAmount()) * 100)
                        : 0;
                      const labelKey = entry.classification ? getClassificationLabelKey(entry.classification) : undefined;
                      const label = labelKey ? t(labelKey) : (entry.classification ?? t('finances.classification.unclassified'));
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
                          <span class="text-sm font-medium w-20 text-right shrink-0">{formatCurrencyCompact(entry.total)}</span>
                          <span class="text-xs text-muted-foreground w-8 text-right shrink-0">
                            {pct()}
                            %
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
    </div>
  );
};
