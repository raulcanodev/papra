import type { Quarter, QuarterlyTaxReport, SimulatedPurchase, TaxModel } from '../taxes.types';
import type { ExpenseCategory } from '@/modules/purchases/purchases.types';
import { A, useParams, useSearchParams } from '@solidjs/router';
import { createMutation, keepPreviousData, useQuery } from '@tanstack/solid-query';
import { createMemo, createSignal, For, Show } from 'solid-js';
import { useI18n } from '@/modules/i18n/i18n.provider';
import { FormField } from '@/modules/invoicing/components/catalog-page';
import { EXPENSE_CATEGORIES, EXPENSE_CATEGORY_LABEL_I18N_KEYS } from '@/modules/purchases/purchases.constants';
import { downloadFile } from '@/modules/shared/files/download';
import { useI18nApiErrors } from '@/modules/shared/http/composables/i18n-api-errors';
import { Button } from '@/modules/ui/components/button';
import { SimpleSelect } from '@/modules/ui/components/simple-select';
import { createToast } from '@/modules/ui/components/sonner';
import { TextField } from '@/modules/ui/components/textfield';
import { getOrganizationRouteHref } from '@/modules/ui/navigation/organization-navigation';
import { TaxModelCard } from '../components/tax-model-card.component';
import { getDaysUntil, getDefaultTaxPeriod } from '../taxes.models';
import { downloadAccountantPack, fetchQuarterlyTaxReport, sendAccountantPack } from '../taxes.services';

const QUARTERS: Quarter[] = [1, 2, 3, 4];

export function QuarterlyTaxesPage() {
  const { t, getLocale, formatDate } = useI18n();
  const { getErrorMessage } = useI18nApiErrors();
  const params = useParams();
  const [searchParams, setSearchParams] = useSearchParams();

  const defaultPeriod = getDefaultTaxPeriod();
  const year = () => Number(searchParams.year) || defaultPeriod.year;
  const quarter = () => (QUARTERS.find(value => String(value) === searchParams.quarter) ?? defaultPeriod.quarter);

  // The purchase being considered: the report is fetched again with it to show what it would save
  const [simulationBaseEuros, setSimulationBaseEuros] = createSignal('');
  const [simulationTaxRateBps, setSimulationTaxRateBps] = createSignal(2_100);
  const [simulationCategory, setSimulationCategory] = createSignal<ExpenseCategory>('goods');
  const simulatedPurchase = createMemo((): SimulatedPurchase | undefined => {
    const baseMinor = Math.round(Number(simulationBaseEuros().replace(',', '.')) * 100);
    return Number.isFinite(baseMinor) && baseMinor > 0 ? { baseMinor, taxRateBps: simulationTaxRateBps(), deductibleRateBps: 10_000, category: simulationCategory() } : undefined;
  });

  const query = useQuery(() => ({
    queryKey: ['organizations', params.organizationId, 'taxes', year(), quarter(), simulatedPurchase() ?? null],
    queryFn: () => fetchQuarterlyTaxReport({ organizationId: params.organizationId, year: year(), quarter: quarter(), simulatedPurchase: simulatedPurchase() }),
    // Typing an amount keeps the current figures on screen while the simulated ones load
    placeholderData: keepPreviousData,
  }));

  const report = () => query.data?.report;
  const money = (minor: number) => new Intl.NumberFormat(getLocale(), { style: 'currency', currency: report()?.currency ?? 'EUR', useGrouping: 'always' }).format(minor / 100);
  const percent = (bps: number) => `${bps / 100} %`;

  const deadlineLabel = (model: Exclude<TaxModel, '202'>) => {
    const deadline = report()?.deadlines.find(item => item.model === model);
    if (!deadline) {
      return undefined;
    }
    const days = getDaysUntil({ date: deadline.dueDate });
    return days < 0
      ? t('taxes.deadline.past', { date: formatDate(deadline.dueDate) })
      : t('taxes.deadline.upcoming', { date: formatDate(deadline.dueDate), days });
  };

  const vatOutcomeCaption = (outcome: QuarterlyTaxReport['vat303']['outcome']) => t(`taxes.vat.outcome.${outcome}` as const);

  const downloadMutation = createMutation(() => ({
    mutationFn: async () => downloadAccountantPack({ organizationId: params.organizationId, year: year(), quarter: quarter() }),
    onSuccess: ({ blob, fileName }) => downloadFile({ url: URL.createObjectURL(blob), fileName }),
    onError: (error: unknown) => createToast({ type: 'error', message: getErrorMessage({ error, defaultMessage: t('taxes.accountant.download-error') }) }),
  }));

  const sendMutation = createMutation(() => ({
    mutationFn: async () => sendAccountantPack({ organizationId: params.organizationId, year: year(), quarter: quarter() }),
    onSuccess: ({ recipient }) => createToast({ type: 'success', message: t('taxes.accountant.sent', { email: recipient }) }),
    onError: (error: unknown) => createToast({ type: 'error', message: getErrorMessage({ error, defaultMessage: t('taxes.accountant.send-error') }) }),
  }));

  const fiscalProfileHref = () => getOrganizationRouteHref({ organizationId: params.organizationId, routeId: 'settingsFiscalProfile' });

  return (
    <main class="page">
      <div class="page-header">
        <div>
          <h1 class="page-title">{t('taxes.title')}</h1>
          <p class="page-description">{t('taxes.description')}</p>
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

      <Show when={report()} fallback={<div class="h-64 animate-pulse rounded-2xl bg-muted/60" />}>
        {getReport => (
          <>
            <Show when={!getReport().profile.isConfigured}>
              <div class="mb-4 flex flex-wrap items-center gap-3 rounded-xl border border-orange-500/30 bg-orange-500/8 p-4 text-sm">
                <div class="i-tabler-alert-circle size-5 shrink-0 text-orange-600" />
                <p class="min-w-0 flex-1">{t('taxes.profile-missing')}</p>
                <Button as={A} size="sm" href={fiscalProfileHref()}>{t('taxes.profile-missing.action')}</Button>
              </div>
            </Show>

            <Show when={getReport().profile.vatRegime !== 'general'}>
              <div class="mb-4 rounded-xl border bg-muted/40 p-4 text-sm text-muted-foreground">{t(`taxes.vat-regime-notice.${getReport().profile.vatRegime}` as 'taxes.vat-regime-notice.exempt')}</div>
            </Show>

            <p class="mb-3 text-sm text-muted-foreground">{t('taxes.counts', { issued: getReport().counts.issuedInvoices, received: getReport().counts.purchaseInvoices })}</p>

            <div class="grid gap-4 lg:grid-cols-2">
              <Show when={getReport().applicable[303]}>
                <TaxModelCard
                  tone="blue"
                  model="303"
                  title={t('taxes.vat.title')}
                  description={t('taxes.vat.description')}
                  result={money(Math.abs(getReport().vat303.resultMinor))}
                  resultCaption={vatOutcomeCaption(getReport().vat303.outcome)}
                  rows={[
                    ...getReport().vat303.output.map(({ rateBps, baseMinor, taxMinor }) => ({ label: t('taxes.vat.output-at', { rate: percent(rateBps), base: money(baseMinor) }), value: money(taxMinor) })),
                    { label: t('taxes.vat.output-total'), value: money(getReport().vat303.outputTaxMinor), strong: true },
                    { label: t('taxes.vat.input-deductible', { base: money(getReport().vat303.inputBaseMinor) }), value: `-${money(getReport().vat303.deductibleTaxMinor)}` },
                  ]}
                  deadline={deadlineLabel('303')}
                />
              </Show>

              <Show when={getReport().applicable[130]}>
                <TaxModelCard
                  tone="purple"
                  model="130"
                  title={t('taxes.income-tax.title')}
                  description={t('taxes.income-tax.description')}
                  result={money(getReport().incomeTax130.resultMinor)}
                  resultCaption={getReport().incomeTax130.resultMinor > 0 ? t('taxes.to-pay') : t('taxes.nothing-to-pay')}
                  rows={[
                    { label: t('taxes.income-tax.income'), value: money(getReport().incomeTax130.incomeMinor) },
                    { label: t('taxes.income-tax.expenses'), value: `-${money(getReport().incomeTax130.expensesMinor)}` },
                    ...(getReport().incomeTax130.difficultExpensesMinor > 0 ? [{ label: t('taxes.income-tax.difficult-expenses'), value: `-${money(getReport().incomeTax130.difficultExpensesMinor)}` }] : []),
                    { label: t('taxes.income-tax.net-income'), value: money(getReport().incomeTax130.netIncomeMinor), strong: true },
                    { label: t('taxes.income-tax.gross', { rate: percent(getReport().incomeTax130.rateBps) }), value: money(getReport().incomeTax130.grossInstalmentMinor) },
                    { label: t('taxes.income-tax.withholdings'), value: `-${money(getReport().incomeTax130.withholdingsMinor)}` },
                    { label: t('taxes.income-tax.previous'), value: `-${money(getReport().incomeTax130.previousInstalmentsMinor)}` },
                  ]}
                  deadline={deadlineLabel('130')}
                  footer={<p class="mt-2 text-xs text-muted-foreground">{t('taxes.income-tax.notice')}</p>}
                />
              </Show>

              <Show when={getReport().applicable[202]}>
                <TaxModelCard
                  tone="emerald"
                  model="202"
                  title={t('taxes.corporate-tax.title')}
                  description={t('taxes.corporate-tax.description')}
                  result={getReport().corporateTax202[0]?.amountMinor === null ? '—' : money(getReport().corporateTax202[0]?.amountMinor ?? 0)}
                  resultCaption={t('taxes.corporate-tax.per-instalment')}
                  rows={getReport().corporateTax202.map(instalment => ({
                    label: t('taxes.corporate-tax.instalment', { period: instalment.period, date: formatDate(instalment.dueDate) }),
                    value: instalment.amountMinor === null ? '—' : money(instalment.amountMinor),
                  }))}
                  footer={(
                    <Show when={getReport().profile.lastCorporateTaxQuotaMinor === null}>
                      <A href={fiscalProfileHref()} class="mt-2 block text-xs text-muted-foreground underline">{t('taxes.corporate-tax.missing-quota')}</A>
                    </Show>
                  )}
                />
              </Show>

              <Show when={getReport().applicable[111]}>
                <TaxModelCard
                  tone="orange"
                  model="111"
                  title={t('taxes.withholdings.title')}
                  description={t('taxes.withholdings.description')}
                  result={money(getReport().professionals111.amountMinor)}
                  resultCaption={t('taxes.to-pay')}
                  rows={[
                    { label: t('taxes.withholdings.payees'), value: String(getReport().professionals111.payeesCount) },
                    { label: t('taxes.withholdings.base'), value: money(getReport().professionals111.baseMinor) },
                  ]}
                  deadline={deadlineLabel('111')}
                />
              </Show>

              <Show when={getReport().applicable[115]}>
                <TaxModelCard
                  tone="pink"
                  model="115"
                  title={t('taxes.rents.title')}
                  description={t('taxes.rents.description')}
                  result={money(getReport().rents115.amountMinor)}
                  resultCaption={t('taxes.to-pay')}
                  rows={[
                    { label: t('taxes.withholdings.payees'), value: String(getReport().rents115.payeesCount) },
                    { label: t('taxes.withholdings.base'), value: money(getReport().rents115.baseMinor) },
                  ]}
                  deadline={deadlineLabel('115')}
                />
              </Show>
            </div>

            <div class="mt-4 grid gap-4 lg:grid-cols-2">
              {/* "If I buy now, how much do I save?" */}
              <section class="rounded-2xl border border-border/80 bg-card p-4">
                <div class="flex items-center gap-2">
                  <div class="i-tabler-calculator size-5 text-violet-600 dark:text-violet-300" />
                  <p class="font-medium">{t('taxes.simulator.title')}</p>
                </div>
                <p class="mt-1 text-sm text-muted-foreground">{t('taxes.simulator.description')}</p>
                <div class="mt-4 grid gap-3 sm:grid-cols-3">
                  <FormField label={t('taxes.simulator.base')}>
                    <TextField type="number" min="0" step="0.01" inputMode="decimal" value={simulationBaseEuros()} onInput={event => setSimulationBaseEuros(event.currentTarget.value)} placeholder="1000" />
                  </FormField>
                  <FormField label={t('purchases.editor.line.vat')}>
                    <SimpleSelect triggerClass="h-10 w-full" value={String(simulationTaxRateBps())} onChange={value => setSimulationTaxRateBps(Number(value))} options={[2_100, 1_000, 400, 0].map(rateBps => ({ value: String(rateBps), label: percent(rateBps) }))} />
                  </FormField>
                  <FormField label={t('purchases.editor.category')}>
                    <SimpleSelect triggerClass="h-10 w-full" value={simulationCategory()} onChange={value => setSimulationCategory(value as ExpenseCategory)} options={EXPENSE_CATEGORIES.map(value => ({ value, label: t(EXPENSE_CATEGORY_LABEL_I18N_KEYS[value]) }))} />
                  </FormField>
                </div>
                <Show when={getReport().simulation}>
                  {getSimulation => (
                    <div class="mt-4 rounded-xl bg-violet-500/8 p-3 text-sm">
                      <p class="font-medium">
                        {t('taxes.simulator.result', { total: money(getSimulation().vat303SavingMinor + getSimulation().incomeTax130SavingMinor) })}
                      </p>
                      <p class="mt-1 text-muted-foreground">
                        {/* A company saves on the yearly corporate tax, not on a quarterly instalment */}
                        {getReport().applicable[130]
                          ? t('taxes.simulator.breakdown', { vat: money(getSimulation().vat303SavingMinor), incomeTax: money(getSimulation().incomeTax130SavingMinor), cost: money(getSimulation().purchase.baseMinor + Math.round(getSimulation().purchase.baseMinor * getSimulation().purchase.taxRateBps / 10_000)) })
                          : t('taxes.simulator.breakdown-company', { vat: money(getSimulation().vat303SavingMinor), cost: money(getSimulation().purchase.baseMinor + Math.round(getSimulation().purchase.baseMinor * getSimulation().purchase.taxRateBps / 10_000)) })}
                      </p>
                    </div>
                  )}
                </Show>
              </section>

              <section class="rounded-2xl border border-border/80 bg-card p-4">
                <div class="flex items-center gap-2">
                  <div class="i-tabler-briefcase size-5 text-emerald-600 dark:text-emerald-300" />
                  <p class="font-medium">{t('taxes.accountant.title')}</p>
                </div>
                <p class="mt-1 text-sm text-muted-foreground">{t('taxes.accountant.description')}</p>
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
                <div class="mt-4 flex flex-wrap gap-2">
                  <Button variant="outline" class="gap-1.5" isLoading={downloadMutation.isPending} onClick={() => downloadMutation.mutate()}>
                    <div class="i-tabler-download size-4" />
                    {t('taxes.accountant.download')}
                  </Button>
                  <Button class="gap-1.5" isLoading={sendMutation.isPending} onClick={() => sendMutation.mutate()}>
                    <div class="i-tabler-send size-4" />
                    {t('taxes.accountant.send')}
                  </Button>
                </div>
                <p class="mt-2 text-xs text-muted-foreground">
                  <A href={fiscalProfileHref()} class="underline">{t('taxes.accountant.email-setting')}</A>
                </p>
              </section>
            </div>

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
    </main>
  );
}
