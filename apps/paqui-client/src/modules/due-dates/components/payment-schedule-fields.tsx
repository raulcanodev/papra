import type { InstalmentsSource, InstalmentStatus, PaymentMethod } from '../due-dates.types';
import { createSignal, Index, Show } from 'solid-js';
import { useI18n } from '@/modules/i18n/i18n.provider';
import { FormField } from '@/modules/invoicing/components/catalog-page';
import { cn } from '@/modules/shared/style/cn';
import { Button } from '@/modules/ui/components/button';
import { SimpleSelect } from '@/modules/ui/components/simple-select';
import { TextField } from '@/modules/ui/components/textfield';
import { INSTALMENT_STATUS_BADGE_CLASSES, INSTALMENT_STATUS_LABEL_I18N_KEYS, PAYMENT_METHOD_LABEL_I18N_KEYS, PAYMENT_METHODS } from '../due-dates.constants';
import { addDays, buildInstalmentsFromTerms, parseTermsDays } from '../due-dates.models';

/** A due date as edited in a form: the date as typed (YYYY-MM-DD) */
export type ScheduleRow = { dueDate: string; amountMinor: number; status?: InstalmentStatus };

const toDateInput = (date: Date) => date.toISOString().slice(0, 10);
const fromDateInput = (value: string) => new Date(`${value}T00:00:00.000Z`);

// The payment method and the due dates of an invoice: as read by the AI, or typed ("30/60/90" splits the total).
// Empty means the server computes one from the due date or the usual terms of the contact.
export function PaymentScheduleFields(props: {
  paymentMethod: PaymentMethod | null;
  onPaymentMethodChange: (value: PaymentMethod | null) => void;
  rows: ScheduleRow[];
  onRowsChange: (rows: ScheduleRow[]) => void;
  issueDate: string;
  payableMinor: number;
  currency: string;
  source?: InstalmentsSource;
  contactTermsDays?: number | null;
}) {
  const { t, getLocale } = useI18n();
  const [terms, setTerms] = createSignal('');

  const money = (minor: number) => new Intl.NumberFormat(getLocale(), { style: 'currency', currency: props.currency }).format(minor / 100);
  const scheduledMinor = () => props.rows.reduce((sum, row) => sum + row.amountMinor, 0);
  const hasMismatch = () => props.rows.length > 0 && scheduledMinor() !== props.payableMinor;
  const issueDate = () => (props.issueDate ? fromDateInput(props.issueDate) : new Date());

  const updateRow = (index: number, changes: Partial<ScheduleRow>) => props.onRowsChange(props.rows.map((row, rowIndex) => (rowIndex === index ? { ...row, ...changes } : row)));

  const applyTerms = () => {
    const days = parseTermsDays(terms());
    if (days.length === 0) {
      return;
    }

    props.onRowsChange(buildInstalmentsFromTerms({ issueDate: issueDate(), payableMinor: props.payableMinor, days }).map(({ dueDate, amountMinor }) => ({ dueDate: toDateInput(dueDate), amountMinor })));
    setTerms('');
  };

  const addRow = () => {
    const last = props.rows.at(-1);
    const nextDate = last ? addDays(fromDateInput(last.dueDate), 30) : addDays(issueDate(), props.contactTermsDays ?? 30);
    const remaining = Math.max(0, props.payableMinor - scheduledMinor());

    props.onRowsChange([...props.rows, { dueDate: toDateInput(nextDate), amountMinor: remaining }]);
  };

  const sourceLabel = () => {
    switch (props.source) {
      case 'document': return t('due-dates.schedule.source.document');
      case 'terms': return t('due-dates.schedule.source.terms');
      case 'contact_terms': return t('due-dates.schedule.source.contact-terms');
      default: return undefined;
    }
  };

  return (
    <section class="flex flex-col gap-4 rounded-xl border bg-card p-4">
      <div class="flex flex-wrap items-start justify-between gap-2">
        <div>
          <h2 class="font-medium">{t('due-dates.schedule.title')}</h2>
          <p class="text-sm text-muted-foreground">{t('due-dates.schedule.description')}</p>
        </div>
        <Show when={sourceLabel()}>
          {getLabel => (
            <span class="flex items-center gap-1.5 rounded-full bg-violet-500/10 px-2 py-0.5 text-xs text-violet-700 dark:text-violet-300">
              <div class="i-tabler-sparkles size-3.5" />
              {getLabel()}
            </span>
          )}
        </Show>
      </div>

      {/* Wraps on the width of the form, not of the screen: the document preview takes half of it on desktops */}
      <div class="flex flex-wrap gap-4 [&>*]:min-w-48 [&>*]:flex-1">
        <FormField label={t('due-dates.schedule.method')}>
          <SimpleSelect
            triggerClass="h-10 w-full"
            value={props.paymentMethod ?? ''}
            onChange={value => props.onPaymentMethodChange(value === '' ? null : value as PaymentMethod)}
            options={[{ value: '', label: t('due-dates.schedule.method.none') }, ...PAYMENT_METHODS.map(method => ({ value: method, label: t(PAYMENT_METHOD_LABEL_I18N_KEYS[method]) }))]}
          />
        </FormField>
        <FormField label={t('due-dates.schedule.terms')}>
          <div class="flex gap-2">
            <TextField
              value={terms()}
              placeholder="30/60/90"
              onInput={event => setTerms(event.currentTarget.value)}
              onKeyDown={(event: KeyboardEvent) => {
                if (event.key === 'Enter') {
                  event.preventDefault();
                  applyTerms();
                }
              }}
            />
            <Button variant="outline" disabled={parseTermsDays(terms()).length === 0} onClick={applyTerms}>{t('due-dates.schedule.terms.apply')}</Button>
          </div>
        </FormField>
      </div>

      <Show
        when={props.rows.length > 0}
        fallback={(
          <p class="rounded-lg bg-muted/60 p-3 text-sm text-muted-foreground">
            {props.contactTermsDays === undefined || props.contactTermsDays === null ? t('due-dates.schedule.empty') : t('due-dates.schedule.empty-with-terms', { days: props.contactTermsDays })}
          </p>
        )}
      >
        <div class="flex flex-col gap-2">
          <Index each={props.rows}>
            {(row, index) => (
              <div class="flex flex-wrap items-end gap-2">
                <FormField label={t('due-dates.schedule.due-date', { number: index + 1 })} class="min-w-38 flex-[1.3]">
                  <TextField type="date" value={row().dueDate} onInput={event => updateRow(index, { dueDate: event.currentTarget.value })} />
                </FormField>
                <FormField label={t('due-dates.schedule.amount')} class="min-w-28 flex-1">
                  <TextField type="number" min="0" step="0.01" value={row().amountMinor / 100} onInput={event => updateRow(index, { amountMinor: Math.round(Number(event.currentTarget.value) * 100) })} />
                </FormField>
                <div class="flex items-center gap-1">
                  <span class={cn('rounded-full px-2 py-0.5 text-xs font-medium whitespace-nowrap', INSTALMENT_STATUS_BADGE_CLASSES[row().status ?? 'pending'])}>
                    {t(INSTALMENT_STATUS_LABEL_I18N_KEYS[row().status ?? 'pending'])}
                  </span>
                  <Button variant="ghost" size="icon" class="text-red-600" aria-label={t('due-dates.schedule.remove')} onClick={() => props.onRowsChange(props.rows.filter((_, rowIndex) => rowIndex !== index))}>
                    <div class="i-tabler-trash size-4" />
                  </Button>
                </div>
              </div>
            )}
          </Index>
        </div>
      </Show>

      <div class="flex flex-wrap items-center justify-between gap-2">
        <Button variant="outline" size="sm" class="gap-1.5" onClick={addRow}>
          <div class="i-tabler-plus size-4" />
          {t('due-dates.schedule.add')}
        </Button>
        <Show when={hasMismatch()}>
          <span class="text-sm text-orange-700 dark:text-orange-300">{t('due-dates.schedule.mismatch', { scheduled: money(scheduledMinor()), payable: money(props.payableMinor) })}</span>
        </Show>
      </div>
    </section>
  );
}

export function toScheduleRows(instalments: { dueDate: Date; amountMinor: number; status?: InstalmentStatus }[] | undefined): ScheduleRow[] {
  return (instalments ?? []).map(({ dueDate, amountMinor, status }) => ({ dueDate: toDateInput(dueDate), amountMinor, status }));
}

export function fromScheduleRows(rows: ScheduleRow[]) {
  return rows.filter(row => row.dueDate !== '').map(({ dueDate, amountMinor, status }) => ({ dueDate: fromDateInput(dueDate), amountMinor, ...(status ? { status } : {}) }));
}
