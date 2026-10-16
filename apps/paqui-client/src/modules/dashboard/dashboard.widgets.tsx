import type { JSX } from 'solid-js';
import type { useI18n } from '../i18n/i18n.provider';
import type { TranslationKeys } from '../i18n/locales.types';
import type { DashboardRevenueMode } from '../preferences/preferences.types';
import type { DashboardMetrics, Ranking } from './dashboard.types';
import { For } from 'solid-js';
import { cn } from '../shared/style/cn';
import { ComparisonChartCard } from './components/comparison-chart-card.component';
import { RankingCard } from './components/ranking-card.component';
import { StatCard } from './components/stat-card.component';

export type DashboardFormatters = {
  t: ReturnType<typeof useI18n>['t'];
  money: (minor: number) => string;
  compactMoney: (minor: number) => string;
  integer: (value: number) => string;
  /** Basis points as a percentage (2500 -> "25 %") */
  share: (bps: number) => string;
  monthLabel: (month: number, style: 'short' | 'long') => string;
  /** Months of the metrics year elapsed so far (12 for a past year) */
  elapsedMonths: number;
};

export type DashboardWidget = {
  id: string;
  titleKey: TranslationKeys;
  /** stat: a KPI card in the four-up row, chart: a wide card in the two-up row */
  size: 'stat' | 'chart';
  render: (args: { metrics: DashboardMetrics; formatters: DashboardFormatters; settings: DashboardWidgetSettings }) => JSX.Element;
};

// What a widget may read and change of the member preferences
export type DashboardWidgetSettings = {
  revenueMode: DashboardRevenueMode;
  setRevenueMode: (mode: DashboardRevenueMode) => void;
};

// Two words in place of the card label: the same card reads what was billed or what the business made
function RevenueModeToggle(props: { formatters: DashboardFormatters; settings: DashboardWidgetSettings }) {
  const modes: DashboardRevenueMode[] = ['billed', 'profit'];

  return (
    <div role="radiogroup" aria-label={props.formatters.t('dashboard.widgets.revenue.mode.label')} class="flex min-w-0 flex-wrap items-center gap-x-1 text-sm font-medium">
      <For each={modes}>
        {(mode, index) => (
          <>
            {index() > 0 && <span class="text-muted-foreground/40" aria-hidden="true">·</span>}
            <button
              type="button"
              role="radio"
              aria-checked={props.settings.revenueMode === mode}
              class={cn(
                'whitespace-nowrap rounded-sm underline-offset-4 transition-colors focus-visible:(outline-none ring-2 ring-ring)',
                props.settings.revenueMode === mode ? 'text-foreground underline decoration-2' : 'text-muted-foreground hover:text-foreground',
              )}
              onClick={() => props.settings.setRevenueMode(mode)}
            >
              {props.formatters.t(`dashboard.widgets.revenue.mode.${mode}`)}
            </button>
          </>
        )}
      </For>
    </div>
  );
}

function renderRanking(props: { ranking: Ranking; formatters: DashboardFormatters; title: string; emptyText: string; tone: 'blue' | 'violet' | 'emerald'; detail: (count: number) => string }) {
  return (
    <RankingCard
      title={props.title}
      total={props.formatters.money(props.ranking.totalMinor)}
      items={props.ranking.entries.map(entry => ({ id: entry.id, label: entry.name, value: entry.totalMinor, shareBps: entry.shareBps, detail: props.detail(entry.count) }))}
      format={props.formatters.money}
      formatShare={props.formatters.share}
      emptyText={props.emptyText}
      tone={props.tone}
    />
  );
}

/**
 * Every widget the home dashboard can show. Customization works on widget ids, so adding a metric is adding an
 * entry here (and its data to the dashboard metrics endpoint), without touching the page.
 */
export const DASHBOARD_WIDGETS: DashboardWidget[] = [
  {
    // One card, two readings: what was billed (what the customers pay) or what the business made (sales minus expenses)
    id: 'revenue-year-to-date',
    titleKey: 'dashboard.widgets.revenue.title',
    size: 'stat',
    render: props => (
      <StatCard
        icon={props.settings.revenueMode === 'profit' ? 'i-tabler-trending-up' : 'i-tabler-coins'}
        tone={props.settings.revenueMode === 'profit' ? 'emerald' : 'blue'}
        label={props.formatters.t(props.settings.revenueMode === 'profit' ? 'dashboard.widgets.profit.title' : 'dashboard.widgets.revenue.title')}
        value={props.settings.revenueMode === 'profit' ? props.metrics.profit.yearToDateMinor : props.metrics.revenue.yearToDateMinor}
        format={props.formatters.money}
        caption={props.settings.revenueMode === 'profit'
          ? props.formatters.t('dashboard.widgets.profit.caption', { expenses: props.formatters.money(props.metrics.profit.expensesYearToDateMinor) })
          : props.formatters.t('dashboard.widgets.revenue.caption')}
        delta={props.settings.revenueMode === 'profit'
          ? { current: props.metrics.profit.yearToDateMinor, previous: props.metrics.profit.previousYearToDateMinor }
          : { current: props.metrics.revenue.yearToDateMinor, previous: props.metrics.revenue.previousYearToDateMinor }}
        hint={props.formatters.t(props.settings.revenueMode === 'profit' ? 'dashboard.widgets.profit.hint' : 'dashboard.widgets.revenue.hint')}
        labelControl={<RevenueModeToggle formatters={props.formatters} settings={props.settings} />}
      />
    ),
  },
  {
    id: 'outstanding',
    titleKey: 'dashboard.widgets.outstanding.title',
    size: 'stat',
    render: props => (
      <StatCard
        icon="i-tabler-clock-dollar"
        tone="orange"
        label={props.formatters.t('dashboard.widgets.outstanding.title')}
        value={props.metrics.outstanding.totalMinor}
        format={props.formatters.money}
        caption={props.formatters.t('dashboard.widgets.outstanding.caption', { count: props.metrics.outstanding.count })}
        hint={props.formatters.t('dashboard.widgets.outstanding.hint')}
        badge={(
          <span class={props.metrics.outstanding.overdueCount > 0
            ? 'shrink-0 rounded-full bg-rose-500/12 px-2 py-0.5 text-sm font-medium text-rose-700 dark:text-rose-400'
            : 'shrink-0 rounded-full bg-emerald-500/12 px-2 py-0.5 text-sm font-medium text-emerald-700 dark:text-emerald-400'}
          >
            {props.metrics.outstanding.overdueCount > 0
              ? props.formatters.t('dashboard.widgets.outstanding.overdue', { count: props.metrics.outstanding.overdueCount })
              : props.formatters.t('dashboard.widgets.outstanding.none-overdue')}
          </span>
        )}
      />
    ),
  },
  {
    id: 'customers',
    titleKey: 'dashboard.widgets.customers.title',
    size: 'stat',
    render: props => (
      <StatCard
        icon="i-tabler-users"
        tone="purple"
        label={props.formatters.t('dashboard.widgets.customers.title')}
        value={props.metrics.customers.total}
        format={props.formatters.integer}
        caption={props.formatters.t('dashboard.widgets.new-this-month', { count: props.metrics.customers.newThisMonth })}
        delta={{ current: props.metrics.customers.newThisMonth, previous: props.metrics.customers.newPreviousMonth }}
        hint={props.formatters.t('dashboard.widgets.customers.hint')}
      />
    ),
  },
  {
    id: 'documents',
    titleKey: 'dashboard.widgets.documents.title',
    size: 'stat',
    render: props => (
      <StatCard
        icon="i-tabler-files"
        tone="emerald"
        label={props.formatters.t('dashboard.widgets.documents.title')}
        value={props.metrics.documents.total}
        format={props.formatters.integer}
        caption={props.formatters.t('dashboard.widgets.new-this-month', { count: props.metrics.documents.newThisMonth })}
        delta={{ current: props.metrics.documents.newThisMonth, previous: props.metrics.documents.newPreviousMonth }}
        hint={props.formatters.t('dashboard.widgets.documents.hint')}
      />
    ),
  },
  {
    id: 'revenue-chart',
    titleKey: 'dashboard.widgets.revenue-chart.title',
    size: 'chart',
    render: props => (
      <ComparisonChartCard
        kind="area"
        color="blue"
        title={props.formatters.t('dashboard.widgets.revenue-chart.title')}
        points={props.metrics.revenue.monthly}
        format={props.formatters.money}
        formatAxis={props.formatters.compactMoney}
        monthLabel={props.formatters.monthLabel}
        legend={{ current: String(props.metrics.year), previous: String(props.metrics.year - 1) }}
        comparisonCaption={{ total: props.formatters.t('dashboard.charts.previous-year'), month: props.formatters.t('dashboard.charts.a-year-earlier') }}
        elapsedMonths={props.formatters.elapsedMonths}
      />
    ),
  },
  {
    id: 'invoices-chart',
    titleKey: 'dashboard.widgets.invoices-chart.title',
    size: 'chart',
    render: props => (
      <ComparisonChartCard
        kind="bar"
        color="violet"
        title={props.formatters.t('dashboard.widgets.invoices-chart.title')}
        points={props.metrics.invoices.monthly}
        format={props.formatters.integer}
        formatAxis={props.formatters.integer}
        monthLabel={props.formatters.monthLabel}
        legend={{ current: String(props.metrics.year), previous: String(props.metrics.year - 1) }}
        comparisonCaption={{ total: props.formatters.t('dashboard.charts.previous-year'), month: props.formatters.t('dashboard.charts.a-year-earlier') }}
        elapsedMonths={props.formatters.elapsedMonths}
      />
    ),
  },
  {
    id: 'top-customers',
    titleKey: 'dashboard.widgets.top-customers.title',
    size: 'chart',
    render: props => renderRanking({
      ranking: props.metrics.topCustomers,
      formatters: props.formatters,
      title: props.formatters.t('dashboard.widgets.top-customers.title'),
      emptyText: props.formatters.t('dashboard.widgets.top-customers.empty'),
      tone: 'blue',
      detail: count => props.formatters.t('dashboard.widgets.ranking.invoices', { count }),
    }),
  },
  {
    id: 'sales-by-representative',
    titleKey: 'dashboard.widgets.sales-by-representative.title',
    size: 'chart',
    render: props => renderRanking({
      ranking: props.metrics.salesByRepresentative,
      formatters: props.formatters,
      title: props.formatters.t('dashboard.widgets.sales-by-representative.title'),
      emptyText: props.formatters.t('dashboard.widgets.sales-by-representative.empty'),
      tone: 'violet',
      detail: count => props.formatters.t('dashboard.widgets.ranking.invoices', { count }),
    }),
  },
];
