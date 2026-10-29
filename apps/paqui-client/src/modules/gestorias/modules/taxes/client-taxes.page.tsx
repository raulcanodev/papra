import type { Quarter } from '@/modules/taxes/taxes.types';
import { useParams, useSearchParams } from '@solidjs/router';
import { createMutation, keepPreviousData, useQuery } from '@tanstack/solid-query';
import { For, Show } from 'solid-js';
import { useI18n } from '@/modules/i18n/i18n.provider';
import { downloadFile } from '@/modules/shared/files/download';
import { useI18nApiErrors } from '@/modules/shared/http/composables/i18n-api-errors';
import { QuarterlyTaxModels } from '@/modules/taxes/components/quarterly-tax-models.component';
import { WithholdingsByPayee } from '@/modules/taxes/components/withholdings-by-payee.component';
import { getDefaultTaxPeriod } from '@/modules/taxes/taxes.models';
import { Button } from '@/modules/ui/components/button';
import { SimpleSelect } from '@/modules/ui/components/simple-select';
import { createToast } from '@/modules/ui/components/sonner';
import { ClientModulePage } from '../../components/client-module-page.component';
import { downloadClientAccountantPack, fetchClientQuarterlyTaxReport } from './client-taxes.services';

const QUARTERS: Quarter[] = [1, 2, 3, 4];

/** The quarter of a client company: the estimation its members see and the documentation pack, without asking for it */
export function ClientTaxesPage() {
  const { t } = useI18n();
  const { getErrorMessage } = useI18nApiErrors();
  const params = useParams();
  const [searchParams, setSearchParams] = useSearchParams();

  const defaultPeriod = getDefaultTaxPeriod();
  const year = () => Number(searchParams.year) || defaultPeriod.year;
  const quarter = () => (QUARTERS.find(value => String(value) === searchParams.quarter) ?? defaultPeriod.quarter);

  const query = useQuery(() => ({
    queryKey: ['gestorias', params.gestoriaId, 'clients', params.organizationId, 'taxes', year(), quarter()],
    queryFn: () => fetchClientQuarterlyTaxReport({ gestoriaId: params.gestoriaId, organizationId: params.organizationId, year: year(), quarter: quarter() }),
    placeholderData: keepPreviousData,
  }));

  const downloadMutation = createMutation(() => ({
    mutationFn: async (clientName: string) => downloadClientAccountantPack({ gestoriaId: params.gestoriaId, organizationId: params.organizationId, year: year(), quarter: quarter(), clientName }),
    onSuccess: ({ blob, fileName }) => downloadFile({ url: URL.createObjectURL(blob), fileName }),
    onError: (error: unknown) => createToast({ type: 'error', message: getErrorMessage({ error, defaultMessage: t('taxes.accountant.download-error') }) }),
  }));

  return (
    <ClientModulePage
      module="taxes"
      description={t('gestorias.modules.taxes.description')}
      actions={(
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
      )}
    >
      {client => (
        <Show when={query.data?.report} fallback={<div class="h-64 animate-pulse rounded-2xl bg-muted/60" />}>
          {getReport => (
            <>
              <Show when={!getReport().profile.isConfigured}>
                <div class="mb-4 flex items-center gap-3 rounded-xl border border-orange-500/30 bg-orange-500/8 p-4 text-sm">
                  <div class="i-tabler-alert-circle size-5 shrink-0 text-orange-600" />
                  <p class="min-w-0 flex-1">{t('gestorias.modules.taxes.profile-missing')}</p>
                </div>
              </Show>

              <p class="mb-3 text-sm text-muted-foreground">{t('taxes.counts', { issued: getReport().counts.issuedInvoices, received: getReport().counts.purchaseInvoices })}</p>

              <QuarterlyTaxModels report={getReport()} />
              <WithholdingsByPayee report={getReport()} />

              <section class="mt-8 border-t pt-6">
                <div class="flex flex-wrap items-start justify-between gap-4">
                  <div class="min-w-0">
                    <div class="flex items-center gap-2">
                      <div class="i-tabler-briefcase size-5 text-emerald-600 dark:text-emerald-300" />
                      <p class="font-medium">{t('gestorias.modules.taxes.pack.title')}</p>
                    </div>
                    <p class="mt-1 text-sm text-muted-foreground">{t('gestorias.modules.taxes.pack.description')}</p>
                    <ul class="mt-3 space-y-1 text-sm">
                      <For each={['taxes.accountant.item.issued-book', 'taxes.accountant.item.received-book', 'taxes.accountant.item.summary', 'taxes.accountant.item.files'] as const}>
                        {key => (
                          <li class="flex items-center gap-2">
                            <div class="i-tabler-check size-4 text-emerald-600" />
                            {t(key)}
                          </li>
                        )}
                      </For>
                    </ul>
                  </div>
                  <Button class="gap-1.5" isLoading={downloadMutation.isPending} onClick={() => downloadMutation.mutate(client.legalName ?? client.name)}>
                    <div class="i-tabler-download size-4" />
                    {t('taxes.accountant.download')}
                  </Button>
                </div>
              </section>

              <p class="mt-6 text-xs text-muted-foreground">
                {t('taxes.disclaimer')}
                {' '}
                <For each={getReport().sources}>
                  {(source, index) => (
                    <>
                      {index() > 0 && ' · '}
                      <a href={source.url} target="_blank" rel="noopener noreferrer" class="underline">{source.label}</a>
                    </>
                  )}
                </For>
              </p>
            </>
          )}
        </Show>
      )}
    </ClientModulePage>
  );
}
