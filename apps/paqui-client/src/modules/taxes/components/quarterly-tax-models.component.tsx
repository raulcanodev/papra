import type { QuarterlyTaxReport, TaxModel } from '../taxes.types';
import { A } from '@solidjs/router';
import { Show } from 'solid-js';
import { useI18n } from '@/modules/i18n/i18n.provider';
import { getDaysUntil } from '../taxes.models';
import { TaxModelCard } from './tax-model-card.component';

/**
 * The estimated result of each tax model that applies to the company for the quarter.
 * Shared by the company quarterly taxes page and the gestoría view of a client.
 */
export function QuarterlyTaxModels(props: {
  report: QuarterlyTaxReport;
  /** Where the missing figures are filled in; none when the reader cannot edit the fiscal profile */
  fiscalProfileHref?: string;
}) {
  const { t, getLocale, formatDate } = useI18n();

  const money = (minor: number) => new Intl.NumberFormat(getLocale(), { style: 'currency', currency: props.report.currency ?? 'EUR', useGrouping: 'always' }).format(minor / 100);
  const percent = (bps: number) => `${bps / 100} %`;

  const deadlineLabel = (model: Exclude<TaxModel, '202'>) => {
    const deadline = props.report.deadlines.find(item => item.model === model);
    if (!deadline) {
      return undefined;
    }
    const days = getDaysUntil({ date: deadline.dueDate });
    return days < 0
      ? t('taxes.deadline.past', { date: formatDate(deadline.dueDate) })
      : t('taxes.deadline.upcoming', { date: formatDate(deadline.dueDate), days });
  };

  const vatOutcomeCaption = (outcome: QuarterlyTaxReport['vat303']['outcome']) => t(`taxes.vat.outcome.${outcome}` as const);

  return (
    <div class="grid gap-4 lg:grid-cols-2">
      <Show when={props.report.applicable[303]}>
        <TaxModelCard
          tone="blue"
          model="303"
          title={t('taxes.vat.title')}
          description={t('taxes.vat.description')}
          result={money(Math.abs(props.report.vat303.resultMinor))}
          resultCaption={vatOutcomeCaption(props.report.vat303.outcome)}
          rows={[
            ...props.report.vat303.output.map(({ rateBps, baseMinor, taxMinor }) => ({ label: t('taxes.vat.output-at', { rate: percent(rateBps), base: money(baseMinor) }), value: money(taxMinor) })),
            { label: t('taxes.vat.output-total'), value: money(props.report.vat303.outputTaxMinor), strong: true },
            { label: t('taxes.vat.input-deductible', { base: money(props.report.vat303.inputBaseMinor) }), value: `-${money(props.report.vat303.deductibleTaxMinor)}` },
          ]}
          deadline={deadlineLabel('303')}
        />
      </Show>

      <Show when={props.report.applicable[130]}>
        <TaxModelCard
          tone="purple"
          model="130"
          title={t('taxes.income-tax.title')}
          description={t('taxes.income-tax.description')}
          result={money(props.report.incomeTax130.resultMinor)}
          resultCaption={props.report.incomeTax130.resultMinor > 0 ? t('taxes.to-pay') : t('taxes.nothing-to-pay')}
          rows={[
            { label: t('taxes.income-tax.income'), value: money(props.report.incomeTax130.incomeMinor) },
            { label: t('taxes.income-tax.expenses'), value: `-${money(props.report.incomeTax130.expensesMinor)}` },
            ...(props.report.incomeTax130.difficultExpensesMinor > 0 ? [{ label: t('taxes.income-tax.difficult-expenses'), value: `-${money(props.report.incomeTax130.difficultExpensesMinor)}` }] : []),
            { label: t('taxes.income-tax.net-income'), value: money(props.report.incomeTax130.netIncomeMinor), strong: true },
            { label: t('taxes.income-tax.gross', { rate: percent(props.report.incomeTax130.rateBps) }), value: money(props.report.incomeTax130.grossInstalmentMinor) },
            { label: t('taxes.income-tax.withholdings'), value: `-${money(props.report.incomeTax130.withholdingsMinor)}` },
            { label: t('taxes.income-tax.previous'), value: `-${money(props.report.incomeTax130.previousInstalmentsMinor)}` },
          ]}
          deadline={deadlineLabel('130')}
          footer={<p class="mt-2 text-xs text-muted-foreground">{t('taxes.income-tax.notice')}</p>}
        />
      </Show>

      <Show when={props.report.applicable[202]}>
        <TaxModelCard
          tone="emerald"
          model="202"
          title={t('taxes.corporate-tax.title')}
          description={t('taxes.corporate-tax.description')}
          result={props.report.corporateTax202[0]?.amountMinor === null ? '—' : money(props.report.corporateTax202[0]?.amountMinor ?? 0)}
          resultCaption={t('taxes.corporate-tax.per-instalment')}
          rows={props.report.corporateTax202.map(instalment => ({
            label: t('taxes.corporate-tax.instalment', { period: instalment.period, date: formatDate(instalment.dueDate) }),
            value: instalment.amountMinor === null ? '—' : money(instalment.amountMinor),
          }))}
          footer={(
            <Show when={props.report.profile.lastCorporateTaxQuotaMinor === null}>
              <Show when={props.fiscalProfileHref} fallback={<p class="mt-2 text-xs text-muted-foreground">{t('taxes.corporate-tax.missing-quota')}</p>}>
                {href => <A href={href()} class="mt-2 block text-xs text-muted-foreground underline">{t('taxes.corporate-tax.missing-quota')}</A>}
              </Show>
            </Show>
          )}
        />
      </Show>

      {/* 111 and 115 are always shown, at 0 too: the user knows they exist and fill in with the IRPF of the received invoices */}
      <TaxModelCard
        tone="orange"
        model="111"
        title={t('taxes.withholdings.title')}
        description={t('taxes.withholdings.description')}
        result={money(props.report.professionals111.amountMinor)}
        resultCaption={props.report.professionals111.amountMinor > 0 ? t('taxes.to-pay') : t('taxes.withholdings.none')}
        rows={[
          { label: t('taxes.withholdings.payees'), value: String(props.report.professionals111.payeesCount) },
          { label: t('taxes.withholdings.base'), value: money(props.report.professionals111.baseMinor) },
        ]}
        deadline={deadlineLabel('111')}
      />

      <TaxModelCard
        tone="pink"
        model="115"
        title={t('taxes.rents.title')}
        description={t('taxes.rents.description')}
        result={money(props.report.rents115.amountMinor)}
        resultCaption={props.report.rents115.amountMinor > 0 ? t('taxes.to-pay') : t('taxes.withholdings.none')}
        rows={[
          { label: t('taxes.withholdings.payees'), value: String(props.report.rents115.payeesCount) },
          { label: t('taxes.withholdings.base'), value: money(props.report.rents115.baseMinor) },
        ]}
        deadline={deadlineLabel('115')}
      />
    </div>
  );
}
