import type { JSX } from 'solid-js';
import type { useI18n } from '../i18n/i18n.provider';
import type { TranslationKeys } from '../i18n/locales.types';
import type { DashboardMetrics } from './dashboard.types';
import { ComparisonChartCard } from './components/comparison-chart-card.component';
import { StatCard } from './components/stat-card.component';

export type DashboardFormatters = {
  t: ReturnType<typeof useI18n>['t'];
  money: (minor: number) => string;
  compactMoney: (minor: number) => string;
  integer: (value: number) => string;
  monthLabel: (month: number, style: 'short' | 'long') => string;
  /** Months of the metrics year elapsed so far (12 for a past year) */
  elapsedMonths: number;
};

export type DashboardWidget = {
  id: string;
  titleKey: TranslationKeys;
  /** stat: a KPI card in the four-up row, chart: a wide card in the two-up row */
  size: 'stat' | 'chart';
  render: (args: { metrics: DashboardMetrics; formatters: DashboardFormatters }) => JSX.Element;
};

/**
 * Every widget the home dashboard can show. Customization works on widget ids, so adding a metric is adding an
 * entry here (and its data to the dashboard metrics endpoint), without touching the page.
 */
export const DASHBOARD_WIDGETS: DashboardWidget[] = [
  {
    id: 'revenue-year-to-date',
    titleKey: 'dashboard.widgets.revenue.title',
    size: 'stat',
    render: props => (
      <StatCard
        icon="i-tabler-coins"
        tone="blue"
        label={props.formatters.t('dashboard.widgets.revenue.title')}
        value={props.metrics.revenue.yearToDateMinor}
        format={props.formatters.money}
        caption={props.formatters.t('dashboard.widgets.revenue.caption')}
        delta={{ current: props.metrics.revenue.yearToDateMinor, previous: props.metrics.revenue.previousYearToDateMinor }}
        hint={props.formatters.t('dashboard.widgets.revenue.hint')}
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
];
