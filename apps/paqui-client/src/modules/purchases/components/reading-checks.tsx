import type { ReadingCheck, ReadingCheckCode } from '../purchases.types';
import type { TranslationKeys } from '@/modules/i18n/locales.types';
import { For, Show } from 'solid-js';
import { useI18n } from '@/modules/i18n/i18n.provider';
import { cn } from '@/modules/shared/style/cn';

const CHECK_LABEL_I18N_KEYS = {
  total_mismatch: 'purchases.editor.check.total_mismatch',
  missing_number: 'purchases.editor.check.missing_number',
  missing_issue_date: 'purchases.editor.check.missing_issue_date',
  issue_date_in_future: 'purchases.editor.check.issue_date_in_future',
  issue_date_too_old: 'purchases.editor.check.issue_date_too_old',
  due_date_before_issue_date: 'purchases.editor.check.due_date_before_issue_date',
  invalid_tax_id: 'purchases.editor.check.invalid_tax_id',
  unusual_vat_rate: 'purchases.editor.check.unusual_vat_rate',
  no_lines: 'purchases.editor.check.no_lines',
  lines_without_price: 'purchases.editor.check.lines_without_price',
  supplier_not_identified: 'purchases.editor.check.supplier_not_identified',
  issued_by_organization: 'purchases.editor.check.issued_by_organization',
} as const satisfies Record<ReadingCheckCode, TranslationKeys>;

// Already shown live elsewhere on the screen (the total as the lines are edited, the supplier panel, the sale warning)
const SHOWN_ELSEWHERE: ReadingCheckCode[] = ['total_mismatch', 'supplier_not_identified', 'issued_by_organization'];

function isDueDateWarning(warning: string) {
  const normalized = warning.toLocaleLowerCase();
  const mentionsDueDate = normalized.includes('vencim') || normalized.includes('due date');
  const mentionsBefore = normalized.includes('anterior') || normalized.includes('before');
  return mentionsDueDate && mentionsBefore;
}

// What the automatic checks found on the reading, errors first, then what the AI itself flagged.
// Paid invoices have no actionable due date, including a duplicate free-text warning from the AI.
export function ReadingChecks(props: { checks: ReadingCheck[]; warnings: string[]; ignoreDueDate?: boolean }) {
  const { t } = useI18n();
  const checks = () => props.checks
    .filter(check => !SHOWN_ELSEWHERE.includes(check.code) && !(props.ignoreDueDate && check.code === 'due_date_before_issue_date'))
    .toSorted((a, b) => Number(b.severity === 'error') - Number(a.severity === 'error'));
  const warnings = () => props.warnings.filter(warning => !(props.ignoreDueDate && isDueDateWarning(warning)));
  const hasErrors = () => checks().some(check => check.severity === 'error');
  const count = () => checks().length + warnings().length;

  return (
    <Show when={count() > 0}>
      <details open={hasErrors()} class={cn('group rounded-lg border px-3 py-2 text-sm', hasErrors() ? 'border-red-500/30 bg-red-500/6' : 'border-orange-500/25 bg-orange-500/5')}>
        <summary class="flex cursor-pointer list-none items-center gap-2 select-none [&::-webkit-details-marker]:hidden">
          <div class={cn('size-4 shrink-0', hasErrors() ? 'i-tabler-alert-triangle text-red-600' : 'i-tabler-eye-check text-orange-600')} />
          <span class="min-w-0 flex-1 font-medium">{t('purchases.editor.warnings-count', { count: count() })}</span>
          <span class="i-tabler-chevron-down size-4 shrink-0 text-muted-foreground transition-transform group-open:rotate-180" />
        </summary>
        <div class="pl-6">
          <ul class="mt-2 list-disc space-y-1 pl-4 text-muted-foreground">
            <For each={checks()}>
              {check => <li class={cn(check.severity === 'error' && 'text-foreground')}>{t(CHECK_LABEL_I18N_KEYS[check.code], check.params ?? {})}</li>}
            </For>
            <For each={warnings()}>{warning => <li>{warning}</li>}</For>
          </ul>
        </div>
      </details>
    </Show>
  );
}
