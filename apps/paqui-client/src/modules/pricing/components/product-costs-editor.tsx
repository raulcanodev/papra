import type { ProductCostLine } from '../pricing.types';
import { useQuery } from '@tanstack/solid-query';
import { createEffect, createMemo, createSignal, createUniqueId, For, Index, on, Show } from 'solid-js';
import { useI18n } from '@/modules/i18n/i18n.provider';
import { cn } from '@/modules/shared/style/cn';
import { Button } from '@/modules/ui/components/button';
import { SimpleSelect } from '@/modules/ui/components/simple-select';
import { formatMoney, parseAmountToMinor } from '../pricing.models';
import { fetchCostConcepts, fetchProductCosts, getPricingQueryKey } from '../pricing.services';

type Row = { key: number; conceptName: string; amountText: string };

let nextRowKey = 0;
const toRow = (line: ProductCostLine): Row => ({ key: nextRowKey++, conceptName: line.conceptName, amountText: line.amountMinor === 0 ? '' : (line.amountMinor / 100).toFixed(2).replace('.', ',') });
const emptyRow = (): Row => ({ key: nextRowKey++, conceptName: '', amountText: '' });

// Rows without a concept are ignored: an empty last row is where the next line gets typed
export function toCostLines(rows: Array<{ conceptName: string; amountText: string }>): ProductCostLine[] {
  return rows
    .filter(row => row.conceptName.trim() !== '')
    .map(row => ({ conceptName: row.conceptName.trim(), amountMinor: parseAmountToMinor(row.amountText) ?? 0 }));
}

/**
 * The cost breakdown of a product, typed like a spreadsheet: Enter on an amount goes to a new line, the concepts already
 * used by the organization are suggested, and a breakdown can be copied from another product to only change what differs.
 */
export function ProductCostsEditor(props: {
  organizationId: string;
  initialLines: ProductCostLine[];
  currency: string;
  /** The catalog price, to show what is left once the cost is paid */
  basePriceMinor: number;
  /** Products whose breakdown can be copied (the edited one excluded) */
  copyCandidates: Array<{ id: string; name: string }>;
  onChange: (lines: ProductCostLine[]) => void;
}) {
  const { t } = useI18n();
  const datalistId = createUniqueId();
  const [rows, setRows] = createSignal<Row[]>([...props.initialLines.map(toRow), emptyRow()]);
  // By position: <Index> keeps each line's inputs (and their focus) while its values change
  const conceptInputs: HTMLInputElement[] = [];

  const conceptsQuery = useQuery(() => ({ queryKey: [...getPricingQueryKey({ organizationId: props.organizationId }), 'concepts'], queryFn: () => fetchCostConcepts({ organizationId: props.organizationId }) }));

  createEffect(on(rows, current => props.onChange(toCostLines(current)), { defer: true }));

  const totalMinor = createMemo(() => toCostLines(rows()).reduce((total, line) => total + line.amountMinor, 0));
  const marginMinor = () => props.basePriceMinor - totalMinor();

  const updateRow = (key: number, changes: Partial<Row>) => setRows(current => current.map(row => (row.key === key ? { ...row, ...changes } : row)));
  const removeRow = (key: number) => setRows(current => (current.length === 1 ? [emptyRow()] : current.filter(row => row.key !== key)));

  // Always one empty row at the end, focused when Enter is pressed on the last amount
  const addRowAfter = (index: number) => {
    if (index + 1 < rows().length) {
      conceptInputs[index + 1]?.focus();
      return;
    }
    setRows(current => [...current, emptyRow()]);
    queueMicrotask(() => conceptInputs[index + 1]?.focus());
  };

  const copyFrom = async (productId: string) => {
    const { lines } = await fetchProductCosts({ organizationId: props.organizationId, productId });
    setRows([...lines.map(toRow), emptyRow()]);
  };

  const inputClass = 'h-9 w-full rounded-md border border-input bg-background px-2.5 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring';

  return (
    <div class="rounded-lg border">
      <div class="flex items-center justify-between gap-2 border-b bg-muted/30 px-3 py-2">
        <div class="text-sm font-medium">{t('pricing.costs.title')}</div>
        <Show when={props.copyCandidates.length > 0}>
          <SimpleSelect
            triggerClass="h-8 w-48 text-xs"
            value=""
            placeholder={t('pricing.costs.copy-from')}
            aria-label={t('pricing.costs.copy-from')}
            options={props.copyCandidates.map(product => ({ value: product.id, label: product.name }))}
            onChange={productId => productId !== '' && copyFrom(productId)}
          />
        </Show>
      </div>

      <datalist id={datalistId}>
        <For each={conceptsQuery.data?.concepts ?? []}>{concept => <option value={concept.name} />}</For>
      </datalist>

      <div class="divide-y">
        <Index each={rows()}>
          {(row, index) => (
            <div class="flex items-center gap-2 px-3 py-1.5">
              <input
                ref={(element) => {
                  conceptInputs[index] = element;
                }}
                class={inputClass}
                list={datalistId}
                placeholder={t('pricing.costs.concept-placeholder')}
                aria-label={t('pricing.costs.concept')}
                value={row().conceptName}
                onInput={event => updateRow(row().key, { conceptName: event.currentTarget.value })}
              />
              <input
                class={cn(inputClass, 'w-28 shrink-0 text-right tabular-nums', parseAmountToMinor(row().amountText) === null && 'border-destructive')}
                inputMode="decimal"
                placeholder="0,00"
                aria-label={t('pricing.costs.amount')}
                value={row().amountText}
                onInput={event => updateRow(row().key, { amountText: event.currentTarget.value })}
                onKeyDown={(event) => {
                  if (event.key === 'Enter') {
                    event.preventDefault();
                    addRowAfter(index);
                  }
                }}
              />
              <button type="button" class="grid size-8 shrink-0 place-items-center rounded-md text-muted-foreground hover:bg-muted hover:text-foreground" aria-label={t('pricing.costs.remove')} onClick={() => removeRow(row().key)}>
                <div class="i-tabler-x size-4" />
              </button>
            </div>
          )}
        </Index>
      </div>

      <div class="flex flex-wrap items-center justify-between gap-2 border-t px-3 py-2 text-sm">
        <Button type="button" variant="ghost" size="sm" class="gap-1.5" onClick={() => addRowAfter(rows().length - 1)}>
          <div class="i-tabler-plus size-4" />
          {t('pricing.costs.add')}
        </Button>
        <div class="flex items-center gap-4 tabular-nums">
          <span class="text-muted-foreground">
            {t('pricing.costs.total')}
            {' '}
            <span class="font-semibold text-foreground">{formatMoney(totalMinor(), props.currency)}</span>
          </span>
          <Show when={props.basePriceMinor > 0 && totalMinor() > 0}>
            <span class="text-muted-foreground">
              {t('pricing.costs.margin')}
              {' '}
              <span class={cn('font-semibold', marginMinor() < 0 ? 'text-destructive' : 'text-emerald-600 dark:text-emerald-400')}>{formatMoney(marginMinor(), props.currency)}</span>
            </span>
          </Show>
        </div>
      </div>
    </div>
  );
}
