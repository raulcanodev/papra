import type { AiReasoningEffort, AiUsageGroupBy, AiUsageRow } from './ai.services';
import type { ActiveFilter, DateRangeValue, FilterField } from '@/modules/ui/components/table-filters';
import { createMutation, useQuery } from '@tanstack/solid-query';
import { createEffect, createMemo, createSignal, For, Show } from 'solid-js';
import { useI18n } from '@/modules/i18n/i18n.provider';
import { queryClient } from '@/modules/shared/query/query-client';
import { cn } from '@/modules/shared/style/cn';
import { Button } from '@/modules/ui/components/button';
import { SimpleSelect } from '@/modules/ui/components/simple-select';
import { createToast } from '@/modules/ui/components/sonner';
import { fromIsoDate, getActiveFilter, isDateRangeValue, resolveDatePreset } from '@/modules/ui/components/table-filters';
import { TableToolbar } from '@/modules/ui/components/table-toolbar';
import { getAiSettings, getAiUsage, saveAiSettings } from './ai.services';

const DEFAULT_EFFORT = '';

// Micro-dollars as dollars: cents for usual amounts, more decimals for the tiny ones so they do not read as zero
export function formatUsdMicros(amount: number) {
  const dollars = amount / 1_000_000;
  const digits = dollars !== 0 && Math.abs(dollars) < 1 ? 4 : 2;
  return new Intl.NumberFormat('es-ES', { style: 'currency', currency: 'USD', minimumFractionDigits: digits, maximumFractionDigits: digits }).format(dollars);
}

const formatCount = (value: number) => new Intl.NumberFormat('es-ES', { notation: value >= 100_000 ? 'compact' : 'standard', maximumFractionDigits: 1 }).format(value);

// The period sent to the server: from the first day at midnight to the day after the last one, in local time
function toPeriod(range: DateRangeValue) {
  const to = fromIsoDate(range.to);
  to.setDate(to.getDate() + 1);
  return { from: fromIsoDate(range.from).toISOString(), to: to.toISOString() };
}

/** What the AI costs: per provider for the period, then per feature, workspace and member; and the model every feature uses */
export function AdminAiUsagePage() {
  const { t } = useI18n();
  const [filters, setFilters] = createSignal<ActiveFilter[]>([{ fieldId: 'date', value: resolveDatePreset('this_month') }]);
  // Drill down: a feature, then a workspace of that feature
  const [feature, setFeature] = createSignal<string | null>(null);
  const [workspace, setWorkspace] = createSignal<{ id: string | null; name: string } | null>(null);

  const filterFields = (): FilterField[] => [{ id: 'date', type: 'date-range', label: t('admin.ai.filter.period'), icon: 'i-tabler-calendar', required: true }];
  const range = () => {
    const value = getActiveFilter(filters(), 'date')?.value;
    return isDateRangeValue(value) ? value : resolveDatePreset('this_month');
  };
  const groupBy = (): AiUsageGroupBy => (workspace() ? 'user' : feature() ? 'organization' : 'feature');

  const usageQuery = useQuery(() => {
    const query = { ...toPeriod(range()), groupBy: groupBy(), feature: feature() ?? undefined, organizationId: workspace()?.id ?? undefined };
    return { queryKey: ['admin', 'ai', 'usage', query], queryFn: () => getAiUsage(query), placeholderData: previous => previous };
  });

  // A feature without a translation yet shows its id
  const featureLabel = (key: string | null) => (key === null ? '—' : t(`admin.ai.feature.${key}` as 'admin.ai.feature.assistant_chat') ?? key);

  const rowLabel = (row: AiUsageRow) => {
    if (groupBy() === 'feature') {
      return featureLabel(row.key);
    }
    if (row.key === null) {
      return groupBy() === 'user' ? t('admin.ai.no-member') : t('admin.ai.no-workspace');
    }
    return row.label ?? row.key;
  };

  const openRow = (row: AiUsageRow) => {
    if (groupBy() === 'feature') {
      setFeature(row.key);
    } else if (groupBy() === 'organization') {
      setWorkspace({ id: row.key, name: rowLabel(row) });
    }
  };

  const totalCost = () => (usageQuery.data?.providers ?? []).reduce((total, provider) => total + provider.costUsdMicros, 0);

  return (
    <main class="page space-y-6">
      <div>
        <h1 class="page-title">{t('admin.ai.title')}</h1>
        <p class="page-description">{t('admin.ai.description')}</p>
      </div>

      <AiModelSettingsCard />

      <TableToolbar fields={filterFields()} filters={filters()} onFiltersChange={setFilters} class="mb-0" />

      <section>
        <div class="mb-3 flex items-baseline justify-between gap-3">
          <h2 class="text-base font-semibold">{t('admin.ai.providers.title')}</h2>
          <span class="text-sm text-muted-foreground">
            {t('admin.ai.providers.total')}
            {' '}
            <span class="font-semibold text-foreground tabular-nums">{formatUsdMicros(totalCost())}</span>
          </span>
        </div>
        <div class="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          <For each={usageQuery.data?.providers ?? []}>
            {provider => (
              <div class={cn('rounded-xl border bg-card px-4 py-3', provider.calls === 0 && 'opacity-60')}>
                <div class="text-sm text-muted-foreground">{provider.label}</div>
                <div class="mt-1 text-2xl font-semibold tabular-nums">{formatUsdMicros(provider.costUsdMicros)}</div>
                <div class="mt-1 text-xs text-muted-foreground">{t('admin.ai.calls', { count: provider.calls })}</div>
                <For each={provider.models}>
                  {model => <div class="mt-0.5 truncate text-xs text-muted-foreground">{`${model.model} · ${formatUsdMicros(model.costUsdMicros)}`}</div>}
                </For>
                <Show when={provider.unpricedCalls > 0}>
                  <div class="mt-1 text-xs text-amber-600 dark:text-amber-400">{t('admin.ai.unpriced', { count: provider.unpricedCalls })}</div>
                </Show>
              </div>
            )}
          </For>
        </div>
      </section>

      <section>
        <nav class="mb-3 flex flex-wrap items-center gap-1 text-sm" aria-label={t('admin.ai.breakdown')}>
          <button
            type="button"
            class={cn('rounded px-1 hover:underline', feature() === null ? 'font-semibold' : 'text-muted-foreground')}
            onClick={() => {
              setFeature(null);
              setWorkspace(null);
            }}
          >
            {t('admin.ai.by-feature')}
          </button>
          <Show when={feature()}>
            {key => (
              <>
                <div class="i-tabler-chevron-right size-4 text-muted-foreground" />
                <button type="button" class={cn('rounded px-1 hover:underline', workspace() === null ? 'font-semibold' : 'text-muted-foreground')} onClick={() => setWorkspace(null)}>
                  {featureLabel(key())}
                </button>
              </>
            )}
          </Show>
          <Show when={workspace()}>
            {current => (
              <>
                <div class="i-tabler-chevron-right size-4 text-muted-foreground" />
                <span class="px-1 font-semibold">{current().name}</span>
              </>
            )}
          </Show>
        </nav>

        <div class="overflow-x-auto rounded-xl border border-border/80 bg-card">
          <table class="w-full min-w-[640px] text-sm">
            <thead class="border-b bg-muted/30 text-xs text-muted-foreground">
              <tr>
                <th class="h-10 px-4 text-left font-medium">{t(groupBy() === 'feature' ? 'admin.ai.column.feature' : groupBy() === 'organization' ? 'admin.ai.column.workspace' : 'admin.ai.column.member')}</th>
                <th class="h-10 px-4 text-right font-medium">{t('admin.ai.column.calls')}</th>
                <th class="h-10 px-4 text-right font-medium">{t('admin.ai.column.input')}</th>
                <th class="h-10 px-4 text-right font-medium">{t('admin.ai.column.output')}</th>
                <th class="h-10 px-4 text-right font-medium">{t('admin.ai.column.cost')}</th>
              </tr>
            </thead>
            <tbody class="divide-y">
              <For each={usageQuery.data?.rows ?? []}>
                {row => (
                  <tr class={cn('transition-colors hover:bg-muted/25', groupBy() !== 'user' && 'cursor-pointer')} onClick={() => openRow(row)}>
                    <td class="h-12 px-4">
                      <div class="flex items-center gap-2 font-medium">
                        {rowLabel(row)}
                        <Show when={groupBy() !== 'user'}><div class="i-tabler-chevron-right size-4 text-muted-foreground" /></Show>
                      </div>
                      <Show when={row.email}><div class="text-xs text-muted-foreground">{row.email}</div></Show>
                      <Show when={row.errors > 0}><div class="text-xs text-destructive">{t('admin.ai.errors', { count: row.errors })}</div></Show>
                    </td>
                    <td class="px-4 text-right tabular-nums">{formatCount(row.calls)}</td>
                    <td class="px-4 text-right tabular-nums text-muted-foreground">{formatCount(row.inputTokens)}</td>
                    <td class="px-4 text-right tabular-nums text-muted-foreground">{formatCount(row.outputTokens)}</td>
                    <td class="px-4 text-right font-medium tabular-nums">{formatUsdMicros(row.costUsdMicros)}</td>
                  </tr>
                )}
              </For>
            </tbody>
          </table>
          <Show when={!usageQuery.isLoading && (usageQuery.data?.rows.length ?? 0) === 0}>
            <div class="py-10 text-center text-sm text-muted-foreground">{t('admin.ai.empty')}</div>
          </Show>
        </div>
      </section>
    </main>
  );
}

/** The model every AI feature uses, changed in one click; it applies to the next calls of every server within seconds */
function AiModelSettingsCard() {
  const { t } = useI18n();
  const query = useQuery(() => ({ queryKey: ['admin', 'ai', 'settings'], queryFn: getAiSettings }));
  const [model, setModel] = createSignal('');
  const [effort, setEffort] = createSignal<string>(DEFAULT_EFFORT);

  createEffect(() => {
    const current = query.data?.current;
    if (current) {
      setModel(current.model);
      setEffort(current.reasoningEffort ?? DEFAULT_EFFORT);
    }
  });

  const selectedModel = createMemo(() => query.data?.models.find(candidate => candidate.id === model()));
  const configuredProviders = () => new Set((query.data?.providers ?? []).filter(provider => provider.isConfigured).map(provider => provider.id));
  const providerLabel = (id: string) => query.data?.providers.find(provider => provider.id === id)?.label ?? id;
  const isDirty = () => query.data?.current?.model !== model() || (query.data?.current?.reasoningEffort ?? DEFAULT_EFFORT) !== effort();

  const save = createMutation(() => ({
    mutationFn: () => saveAiSettings({ model: model(), reasoningEffort: effort() === DEFAULT_EFFORT ? null : effort() as AiReasoningEffort }),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['admin', 'ai', 'settings'] });
      createToast({ type: 'success', message: t('admin.ai.model.saved') });
    },
    onError: () => createToast({ type: 'error', message: t('admin.ai.model.error') }),
  }));

  return (
    <section class="rounded-xl border bg-card p-4">
      <div class="mb-3 flex flex-wrap items-baseline justify-between gap-2">
        <h2 class="text-base font-semibold">{t('admin.ai.model.title')}</h2>
        <Show when={query.data}>
          {data => <span class="text-xs text-muted-foreground">{data().source === 'admin' ? t('admin.ai.model.source-admin') : t('admin.ai.model.source-environment')}</span>}
        </Show>
      </div>
      <Show when={query.data?.current} fallback={<Show when={!query.isLoading}><p class="text-sm text-muted-foreground">{t('admin.ai.model.not-configured')}</p></Show>}>
        <div class="flex flex-wrap items-end gap-3">
          <label class="block min-w-60 flex-1 text-sm font-medium">
            {t('admin.ai.model.model')}
            <SimpleSelect
              class="mt-1.5"
              triggerClass="h-10 w-full"
              value={model()}
              onChange={(value) => {
                setModel(value);
                const next = query.data?.models.find(candidate => candidate.id === value);
                if (!next?.efforts.includes(effort() as AiReasoningEffort)) {
                  setEffort(DEFAULT_EFFORT);
                }
              }}
              options={(query.data?.models ?? []).filter(candidate => configuredProviders().has(candidate.provider)).map(candidate => ({ value: candidate.id, label: `${providerLabel(candidate.provider)} · ${candidate.label}` }))}
            />
          </label>
          <label class="block w-44 text-sm font-medium">
            {t('admin.ai.model.effort')}
            <SimpleSelect
              class="mt-1.5"
              triggerClass="h-10 w-full"
              value={effort()}
              disabled={(selectedModel()?.efforts.length ?? 0) === 0}
              onChange={setEffort}
              options={[{ value: DEFAULT_EFFORT, label: t('admin.ai.model.effort-default') }, ...(selectedModel()?.efforts ?? []).map(value => ({ value, label: t(`admin.ai.model.effort.${value}`) }))]}
            />
          </label>
          <Button variant="primary" disabled={!isDirty() || model() === ''} isLoading={save.isPending} onClick={() => save.mutate()}>{t('admin.ai.model.save')}</Button>
        </div>
        <Show when={selectedModel()}>
          {current => (
            <p class="mt-2 text-xs text-muted-foreground">
              {t('admin.ai.model.prices', { input: current().prices.input, output: current().prices.output, cached: current().prices.cacheRead })}
            </p>
          )}
        </Show>
      </Show>
    </section>
  );
}

export default AdminAiUsagePage;
