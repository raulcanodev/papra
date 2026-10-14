import type { DashboardFormatters } from '../dashboard.widgets';
import type { ActiveFilter, FilterField } from '@/modules/ui/components/table-filters';
import { useParams } from '@solidjs/router';
import { useQuery } from '@tanstack/solid-query';
import { createEffect, createMemo, createSignal, For, Match, on, Show, Switch } from 'solid-js';
import { useI18n } from '@/modules/i18n/i18n.provider';
import { Button } from '@/modules/ui/components/button';
import { Popover, PopoverContent, PopoverTrigger } from '@/modules/ui/components/popover';
import { SimpleCheckbox } from '@/modules/ui/components/simple-checkbox';
import { getActiveFilter, isDateRangeValue, resolveDatePreset } from '@/modules/ui/components/table-filters';
import { TableToolbar } from '@/modules/ui/components/table-toolbar';
import { fetchDashboardMetrics } from '../dashboard.services';
import { readHiddenWidgetIds, writeHiddenWidgetIds } from '../dashboard.storage';
import { DASHBOARD_WIDGETS } from '../dashboard.widgets';

export function HomePage() {
  const params = useParams();
  const { t, getLocale } = useI18n();
  const [filters, setFilters] = createSignal<ActiveFilter[]>([{ fieldId: 'period', value: resolveDatePreset('this_year') }]);
  const filterFields = createMemo((): FilterField[] => [{
    id: 'period',
    type: 'date-range',
    label: t('dashboard.filters.period'),
    icon: 'i-tabler-calendar',
    required: true,
    presets: ['this_year', 'last_year'],
  }]);
  const selectedYear = () => {
    const value = getActiveFilter(filters(), 'period')?.value;
    return isDateRangeValue(value) ? Number(value.from.slice(0, 4)) : new Date().getFullYear();
  };

  const query = useQuery(() => ({
    queryKey: ['organizations', params.organizationId, 'dashboard', 'metrics', selectedYear()],
    queryFn: () => fetchDashboardMetrics({ organizationId: params.organizationId, year: selectedYear() }),
  }));

  const [hiddenWidgetIds, setHiddenWidgetIds] = createSignal<string[]>([]);
  createEffect(on(() => params.organizationId, organizationId => setHiddenWidgetIds(readHiddenWidgetIds({ organizationId }))));

  const toggleWidget = (widgetId: string, isVisible: boolean) => {
    const next = isVisible ? hiddenWidgetIds().filter(id => id !== widgetId) : [...hiddenWidgetIds(), widgetId];
    setHiddenWidgetIds(next);
    writeHiddenWidgetIds({ organizationId: params.organizationId, hiddenWidgetIds: next });
  };

  const visibleWidgets = createMemo(() => DASHBOARD_WIDGETS.filter(widget => !hiddenWidgetIds().includes(widget.id)));
  const statWidgets = () => visibleWidgets().filter(widget => widget.size === 'stat');
  const chartWidgets = () => visibleWidgets().filter(widget => widget.size === 'chart');

  const formatters = createMemo((): DashboardFormatters => {
    const locale = getLocale();
    const currency = query.data?.metrics.currency ?? 'EUR';
    // Spanish only groups thousands from five digits by default ("9865 €"), grouping always reads better on a dashboard
    const moneyFormat = new Intl.NumberFormat(locale, { style: 'currency', currency, maximumFractionDigits: 0, useGrouping: 'always' });
    const compactFormat = new Intl.NumberFormat(locale, { style: 'currency', currency, notation: 'compact', maximumFractionDigits: 1 });
    const integerFormat = new Intl.NumberFormat(locale, { maximumFractionDigits: 0, useGrouping: 'always' });
    const now = new Date();
    const metricsYear = query.data?.metrics.year ?? now.getUTCFullYear();
    const monthFormats = {
      short: new Intl.DateTimeFormat(locale, { month: 'short', timeZone: 'UTC' }),
      long: new Intl.DateTimeFormat(locale, { month: 'long', timeZone: 'UTC' }),
    };

    return {
      t,
      // Amounts travel in minor units (cents)
      money: minor => moneyFormat.format(minor / 100),
      compactMoney: minor => compactFormat.format(minor / 100),
      integer: value => integerFormat.format(Math.round(value)),
      elapsedMonths: metricsYear < now.getUTCFullYear() ? 12 : now.getUTCMonth() + 1,
      monthLabel: (month, style) => {
        const label = monthFormats[style].format(new Date(Date.UTC(2000, month - 1, 1)));
        return label.charAt(0).toUpperCase() + label.slice(1).replace(/\.$/, '');
      },
    };
  });

  return (
    <main class="page">
      <div class="page-header">
        <div>
          <h1 class="page-title">{t('dashboard.title')}</h1>
          <p class="page-description">{t('dashboard.description')}</p>
        </div>

        <Popover>
          <PopoverTrigger as={Button} variant="outline" size="sm" class="gap-1.5">
            <div class="i-tabler-layout-dashboard size-4" />
            {t('dashboard.customize.button')}
          </PopoverTrigger>
          <PopoverContent class="w-64 p-3">
            <p class="text-sm font-medium">{t('dashboard.customize.title')}</p>
            <p class="mb-3 text-xs text-muted-foreground">{t('dashboard.customize.description')}</p>
            <div class="flex flex-col gap-2">
              <For each={DASHBOARD_WIDGETS}>
                {widget => (
                  <SimpleCheckbox
                    checked={!hiddenWidgetIds().includes(widget.id)}
                    onChange={checked => toggleWidget(widget.id, checked)}
                    label={t(widget.titleKey)}
                  />
                )}
              </For>
            </div>
          </PopoverContent>
        </Popover>
      </div>

      <TableToolbar fields={filterFields()} filters={filters()} onFiltersChange={setFilters} class="mb-4" />

      <Switch>
        <Match when={query.isError}>
          <div class="rounded-xl border border-dashed py-14 text-center text-sm text-muted-foreground">{t('dashboard.error')}</div>
        </Match>

        <Match when={query.isLoading}>
          <div class="grid gap-4 sm:grid-cols-2 xl:grid-cols-4" aria-busy="true">
            <For each={Array.from({ length: 4 })}>{() => <div class="h-[168px] animate-pulse rounded-2xl bg-muted/60" />}</For>
          </div>
          <div class="mt-4 grid gap-4 lg:grid-cols-2">
            <For each={Array.from({ length: 2 })}>{() => <div class="h-[344px] animate-pulse rounded-2xl bg-muted/60" />}</For>
          </div>
        </Match>

        <Match when={query.data?.metrics}>
          {getMetrics => (
            <>
              <Show when={visibleWidgets().length === 0}>
                <div class="rounded-xl border border-dashed py-14 text-center text-sm text-muted-foreground">{t('dashboard.customize.empty')}</div>
              </Show>

              <Show when={statWidgets().length > 0}>
                <div class="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
                  <For each={statWidgets()}>{widget => widget.render({ metrics: getMetrics(), formatters: formatters() })}</For>
                </div>
              </Show>

              <Show when={chartWidgets().length > 0}>
                <div class="mt-4 grid gap-4 lg:grid-cols-2">
                  <For each={chartWidgets()}>{widget => widget.render({ metrics: getMetrics(), formatters: formatters() })}</For>
                </div>
              </Show>
            </>
          )}
        </Match>
      </Switch>
    </main>
  );
}
