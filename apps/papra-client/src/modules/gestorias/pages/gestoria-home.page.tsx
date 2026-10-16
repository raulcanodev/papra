import type { GestoriaClient, GestoriaClientActivity } from '../gestorias.types';
import type { Quarter } from '@/modules/taxes/taxes.types';
import { useNavigate, useParams, useSearchParams } from '@solidjs/router';
import { keepPreviousData, useQuery } from '@tanstack/solid-query';
import { createSignal, For, Show } from 'solid-js';
import { StatCard } from '@/modules/dashboard/components/stat-card.component';
import { RelativeTime } from '@/modules/i18n/components/RelativeTime';
import { useI18n } from '@/modules/i18n/i18n.provider';
import { CatalogCell, CatalogRow, CatalogTable } from '@/modules/invoicing/components/catalog-page';
import { getDefaultTaxPeriod } from '@/modules/taxes/taxes.models';
import { DiceBearAvatar } from '@/modules/ui/components/dicebear-avatar';
import { SimpleSelect } from '@/modules/ui/components/simple-select';
import { TableToolbar } from '@/modules/ui/components/table-toolbar';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/modules/ui/components/tooltip';
import { useGestoria } from '../gestoria.context';
import { GESTORIA_MODULE_DEFINITIONS } from '../gestorias.constants';
import { getClientModules, getGestoriaClientHref } from '../gestorias.navigation';
import { fetchGestoriaActivity } from '../gestorias.services';

const QUARTERS: Quarter[] = [1, 2, 3, 4];

type ClientRow = GestoriaClient & { activity?: GestoriaClientActivity; lastUpdatedAt: Date | null };

/** Every client company at a glance for a quarter: what each one already has on its books, nothing to ask for */
export function GestoriaHomePage() {
  const { t, getLocale } = useI18n();
  const params = useParams();
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const { getGestoria, getClients, isLoading } = useGestoria();
  const [search, setSearch] = createSignal('');

  // The quarter being filed by default: in October, the third one
  const defaultPeriod = getDefaultTaxPeriod();
  const year = () => Number(searchParams.year) || defaultPeriod.year;
  const quarter = () => (QUARTERS.find(value => String(value) === searchParams.quarter) ?? defaultPeriod.quarter);

  const activityQuery = useQuery(() => ({
    queryKey: ['gestorias', params.gestoriaId, 'activity', year(), quarter()],
    queryFn: () => fetchGestoriaActivity({ gestoriaId: params.gestoriaId, year: year(), quarter: quarter() }),
    placeholderData: keepPreviousData,
  }));

  const money = (minor: number) => new Intl.NumberFormat(getLocale(), { style: 'currency', currency: 'EUR', maximumFractionDigits: 0 }).format(minor / 100);

  // Plain derivations, not memos: read during the route transition, a memo over a pending query has no value yet
  const rows = (): ClientRow[] => {
    const term = search().trim().toLowerCase();

    return getClients()
      .filter(client => `${client.name} ${client.legalName ?? ''} ${client.taxId ?? ''}`.toLowerCase().includes(term))
      .map((client) => {
        const activity = activityQuery.data?.activity.find(item => item.organizationId === client.organizationId);
        const dates = [activity?.issued?.lastUpdatedAt, activity?.received?.lastUpdatedAt].filter((date): date is Date => date instanceof Date);

        return { ...client, activity, lastUpdatedAt: dates.length > 0 ? new Date(Math.max(...dates.map(date => date.getTime()))) : null };
      });
  };

  // Figures of all the companies the gestoría can read, only from the granted modules
  const totals = () => {
    const activity = activityQuery.data?.activity ?? [];

    return {
      issuedBaseMinor: activity.reduce((total, item) => total + (item.issued?.baseMinor ?? 0), 0),
      issuedCount: activity.reduce((total, item) => total + (item.issued?.count ?? 0), 0),
      receivedBaseMinor: activity.reduce((total, item) => total + (item.received?.baseMinor ?? 0), 0),
      receivedCount: activity.reduce((total, item) => total + (item.received?.count ?? 0), 0),
      outputTaxMinor: activity.reduce((total, item) => total + (item.issued?.taxMinor ?? 0), 0),
      inputTaxMinor: activity.reduce((total, item) => total + (item.received?.taxMinor ?? 0), 0),
      activeClients: activity.filter(item => (item.issued?.count ?? 0) + (item.received?.count ?? 0) > 0).length,
    };
  };

  const booksCell = (books: GestoriaClientActivity['issued'] | undefined) => (
    <Show when={books} fallback={<span class="text-muted-foreground/60">—</span>}>
      {getBooks => (
        <div class="text-right">
          <div class="font-medium tabular-nums">{money(getBooks().baseMinor)}</div>
          <div class="text-xs text-muted-foreground">{t('gestorias.home.table.invoices-count', { count: getBooks().count })}</div>
        </div>
      )}
    </Show>
  );

  return (
    <main class="page">
      <div class="page-header">
        <div>
          <h1 class="page-title">{getGestoria()?.name ?? t('gestorias.home.title')}</h1>
          <p class="page-description">{t('gestorias.home.description')}</p>
        </div>
        <div class="flex items-center gap-2">
          <SimpleSelect
            aria-label={t('taxes.period.quarter')}
            triggerClass="w-28"
            value={String(quarter())}
            onChange={value => setSearchParams({ quarter: value, year: year() })}
            options={QUARTERS.map(value => ({ value: String(value), label: t('taxes.period.quarter-label', { quarter: value }) }))}
          />
          <SimpleSelect
            aria-label={t('taxes.period.year')}
            triggerClass="w-24"
            value={String(year())}
            onChange={value => setSearchParams({ year: value, quarter: quarter() })}
            options={[2, 1, 0].map(yearsAgo => new Date().getFullYear() - yearsAgo).map(value => ({ value: String(value), label: String(value) }))}
          />
        </div>
      </div>

      <Show
        when={isLoading() || getClients().length > 0}
        fallback={(
          <div class="rounded-xl border border-dashed py-16 text-center">
            <div class="i-tabler-building-store mx-auto mb-3 size-9 text-muted-foreground/50" />
            <p class="font-medium">{t('gestorias.home.empty.title')}</p>
            <p class="mx-auto mt-1 max-w-md text-sm text-muted-foreground">{t('gestorias.home.empty.description')}</p>
          </div>
        )}
      >
        <div class="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          <StatCard
            icon="i-tabler-building-store"
            tone="sky"
            label={t('gestorias.home.stats.clients')}
            value={getClients().length}
            format={value => String(Math.round(value))}
            caption={t('gestorias.home.stats.clients.caption', { count: totals().activeClients })}
          />
          <StatCard
            icon="i-tabler-receipt"
            tone="blue"
            label={t('gestorias.home.stats.issued')}
            value={totals().issuedBaseMinor}
            format={money}
            caption={t('gestorias.home.stats.invoices-caption', { count: totals().issuedCount })}
          />
          <StatCard
            icon="i-tabler-file-invoice"
            tone="orange"
            label={t('gestorias.home.stats.received')}
            value={totals().receivedBaseMinor}
            format={money}
            caption={t('gestorias.home.stats.invoices-caption', { count: totals().receivedCount })}
          />
          <StatCard
            icon="i-tabler-receipt-tax"
            tone="purple"
            label={t('gestorias.home.stats.vat')}
            value={totals().outputTaxMinor - totals().inputTaxMinor}
            format={money}
            caption={t('gestorias.home.stats.vat.caption')}
            hint={t('gestorias.home.stats.vat.hint')}
          />
        </div>

        <TableToolbar class="mt-6" search={search()} onSearchChange={setSearch} searchPlaceholder={t('gestorias.home.search')} />

        <Show
          when={rows().length > 0 || isLoading()}
          fallback={<p class="rounded-xl border border-dashed py-10 text-center text-sm text-muted-foreground">{t('gestorias.client-switcher.empty')}</p>}
        >
          <CatalogTable headers={[
            { label: t('gestorias.home.table.client') },
            { label: t('gestorias.home.table.issued'), class: 'text-right' },
            { label: t('gestorias.home.table.received'), class: 'text-right' },
            { label: t('gestorias.home.table.last-activity') },
            { label: t('gestorias.home.table.modules') },
            { label: '', class: 'w-10' },
          ]}
          >
            <For each={rows()}>
              {row => (
                <CatalogRow onClick={() => navigate(getGestoriaClientHref({ gestoriaId: params.gestoriaId, client: row }))}>
                  <CatalogCell>
                    <div class="flex items-center gap-2.5">
                      <DiceBearAvatar seed={row.organizationId} type="organization" alt="" class="size-8 shrink-0 rounded-md border" />
                      <div class="min-w-0">
                        <div class="truncate font-medium">{row.name}</div>
                        <div class="truncate text-xs text-muted-foreground">{[row.taxId, row.legalName !== row.name ? row.legalName : null].filter(Boolean).join(' · ') || '—'}</div>
                      </div>
                    </div>
                  </CatalogCell>
                  <CatalogCell>{booksCell(row.activity?.issued)}</CatalogCell>
                  <CatalogCell>{booksCell(row.activity?.received)}</CatalogCell>
                  <CatalogCell class="text-muted-foreground">
                    <Show when={row.lastUpdatedAt} fallback="—">
                      {date => <RelativeTime date={date()} />}
                    </Show>
                  </CatalogCell>
                  <CatalogCell>
                    <div class="flex items-center gap-1">
                      <For each={getClientModules({ client: row })}>
                        {module => (
                          <Tooltip>
                            <TooltipTrigger as="span" class="flex size-6 items-center justify-center rounded-md bg-muted text-muted-foreground">
                              <div class={`${GESTORIA_MODULE_DEFINITIONS[module].icon} size-3.5`} aria-label={t(GESTORIA_MODULE_DEFINITIONS[module].labelKey)} />
                            </TooltipTrigger>
                            <TooltipContent>{t(GESTORIA_MODULE_DEFINITIONS[module].labelKey)}</TooltipContent>
                          </Tooltip>
                        )}
                      </For>
                    </div>
                  </CatalogCell>
                  <CatalogCell>
                    <div class="i-tabler-chevron-right size-4 text-muted-foreground" />
                  </CatalogCell>
                </CatalogRow>
              )}
            </For>
          </CatalogTable>
        </Show>
      </Show>
    </main>
  );
}
