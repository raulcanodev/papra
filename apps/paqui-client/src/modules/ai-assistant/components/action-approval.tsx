import type { ToolConfirmation } from '../ai-assistant.services';
import type { TranslationKeys } from '@/modules/i18n/locales.types';
import { createSignal, For, Show } from 'solid-js';
import { getClassificationLabelKey } from '@/modules/finances/finances-labels';
import { useI18n } from '@/modules/i18n/i18n.provider';
import { cn } from '@/modules/shared/style/cn';
import { Button } from '@/modules/ui/components/button';

type Args = Record<string, unknown>;
type Translate = ReturnType<typeof useI18n>['t'];

type ActionPresentation = {
  icon: string;
  labelKey: TranslationKeys;
  isDestructive?: boolean;
};

const DESTRUCTIVE = { isDestructive: true };

// What each action that needs the user's approval is called, in their words, not the tool's
const ACTION_PRESENTATIONS: Record<string, ActionPresentation> = {
  create_contact: { icon: 'i-tabler-user-plus', labelKey: 'ai-assistant.action.create-contact' },
  update_contact: { icon: 'i-tabler-user-edit', labelKey: 'ai-assistant.action.update-contact' },
  delete_contact: { icon: 'i-tabler-user-x', labelKey: 'ai-assistant.action.delete-contact', ...DESTRUCTIVE },
  update_fiscal_profile: { icon: 'i-tabler-building-bank', labelKey: 'ai-assistant.action.update-fiscal-profile' },
  update_document: { icon: 'i-tabler-file-pencil', labelKey: 'ai-assistant.action.update-document' },
  create_invoice_draft: { icon: 'i-tabler-file-invoice', labelKey: 'ai-assistant.action.create-invoice-draft' },
  update_invoice_draft: { icon: 'i-tabler-file-invoice', labelKey: 'ai-assistant.action.update-invoice-draft' },
  delete_draft_invoice: { icon: 'i-tabler-file-x', labelKey: 'ai-assistant.action.delete-draft-invoice', ...DESTRUCTIVE },
  issue_invoice: { icon: 'i-tabler-file-certificate', labelKey: 'ai-assistant.action.issue-invoice', ...DESTRUCTIVE },
  send_invoice_email: { icon: 'i-tabler-mail-forward', labelKey: 'ai-assistant.action.send-invoice-email', ...DESTRUCTIVE },
  mark_invoice_paid: { icon: 'i-tabler-cash', labelKey: 'ai-assistant.action.mark-invoice-paid' },
  import_issued_invoice: { icon: 'i-tabler-file-import', labelKey: 'ai-assistant.action.import-issued-invoice' },
  create_purchase_invoice: { icon: 'i-tabler-receipt', labelKey: 'ai-assistant.action.create-purchase-invoice' },
  update_purchase_invoice: { icon: 'i-tabler-receipt', labelKey: 'ai-assistant.action.update-purchase-invoice' },
  set_purchase_invoice_status: { icon: 'i-tabler-receipt', labelKey: 'ai-assistant.action.set-purchase-invoice-status' },
  delete_purchase_invoice: { icon: 'i-tabler-receipt-off', labelKey: 'ai-assistant.action.delete-purchase-invoice', ...DESTRUCTIVE },
  create_product: { icon: 'i-tabler-package', labelKey: 'ai-assistant.action.create-product' },
  update_product: { icon: 'i-tabler-package', labelKey: 'ai-assistant.action.update-product' },
  delete_product: { icon: 'i-tabler-package-off', labelKey: 'ai-assistant.action.delete-product', ...DESTRUCTIVE },
  create_tax_rate: { icon: 'i-tabler-percentage', labelKey: 'ai-assistant.action.create-tax-rate' },
  update_tax_rate: { icon: 'i-tabler-percentage', labelKey: 'ai-assistant.action.update-tax-rate' },
  delete_tax_rate: { icon: 'i-tabler-percentage', labelKey: 'ai-assistant.action.delete-tax-rate', ...DESTRUCTIVE },
  createClassificationRule: { icon: 'i-tabler-rule', labelKey: 'ai-assistant.tool.create-classification-rule' },
  updateClassificationRule: { icon: 'i-tabler-rule', labelKey: 'ai-assistant.tool.update-classification-rule' },
  deleteClassificationRule: { icon: 'i-tabler-trash', labelKey: 'ai-assistant.tool.delete-classification-rule', ...DESTRUCTIVE },
  consolidateClassificationRules: { icon: 'i-tabler-arrows-join', labelKey: 'ai-assistant.action.consolidate-rules' },
  createTaggingRule: { icon: 'i-tabler-rule', labelKey: 'ai-assistant.tool.create-tagging-rule' },
  updateTaggingRule: { icon: 'i-tabler-rule', labelKey: 'ai-assistant.tool.update-tagging-rule' },
  deleteTaggingRule: { icon: 'i-tabler-trash', labelKey: 'ai-assistant.tool.delete-tagging-rule', ...DESTRUCTIVE },
  restoreFinanceBudgetVersion: { icon: 'i-tabler-history', labelKey: 'ai-assistant.action.restore-budget' },
};

const FIELD_LABEL_KEYS: Record<string, TranslationKeys> = {
  name: 'ai-assistant.field.name',
  email: 'ai-assistant.field.email',
  phone: 'ai-assistant.field.phone',
  taxId: 'ai-assistant.field.tax-id',
  bankAccount: 'ai-assistant.field.bank-account',
  address: 'ai-assistant.field.address',
  country: 'ai-assistant.field.country',
  currency: 'ai-assistant.field.currency',
  paymentTermsDays: 'ai-assistant.field.payment-terms',
  notes: 'ai-assistant.field.notes',
  number: 'ai-assistant.field.number',
  issueDate: 'ai-assistant.field.issue-date',
  dueDate: 'ai-assistant.field.due-date',
  items: 'ai-assistant.field.items',
  description: 'ai-assistant.field.description',
  unit: 'ai-assistant.field.unit',
  unitPrice: 'ai-assistant.field.unit-price',
  taxRatePercent: 'ai-assistant.field.tax-rate',
  withholdingPercent: 'ai-assistant.field.withholding',
  equivalenceSurcharge: 'ai-assistant.field.equivalence-surcharge',
  classification: 'ai-assistant.field.classification',
  conditions: 'ai-assistant.field.conditions',
};

// Shown in the title (roles, kind) or meaningless to a person (ids, internal flags)
const HIDDEN_FIELDS = new Set(['kind', 'isCustomer', 'isSupplier', 'isSalesRepresentative', 'addressLine1', 'addressLine2', 'postalCode', 'city', 'region', 'metadata', 'enabled', 'conditionMatchMode', 'tagIds', 'ruleIds', 'documentId']);

const asText = (value: unknown) => (typeof value === 'string' && value.trim() !== '' ? value.trim() : undefined);

export function getActionLabel({ confirmation, t }: { confirmation: ToolConfirmation; t: Translate }) {
  const args = confirmation.args as Args;

  if (confirmation.toolName === 'create_contact') {
    const roleKey: TranslationKeys = args.isSupplier === true
      ? 'ai-assistant.action.create-supplier'
      : args.isCustomer === true
        ? 'ai-assistant.action.create-customer'
        : args.isSalesRepresentative === true ? 'ai-assistant.action.create-sales-representative' : 'ai-assistant.action.create-contact';

    return t(roleKey);
  }

  if (confirmation.toolName === 'create_purchase_invoice' && args.kind === 'delivery_note') {
    return t('ai-assistant.action.create-delivery-note');
  }

  const presentation = ACTION_PRESENTATIONS[confirmation.toolName];

  return presentation ? t(presentation.labelKey) : t('ai-assistant.action.generic');
}

export function getActionIcon({ confirmation }: { confirmation: ToolConfirmation }) {
  return ACTION_PRESENTATIONS[confirmation.toolName]?.icon ?? 'i-tabler-bolt';
}

export function isDestructiveAction({ confirmation }: { confirmation: ToolConfirmation }) {
  return ACTION_PRESENTATIONS[confirmation.toolName]?.isDestructive === true;
}

// What the action is about: the name of the contact, product or rule, the number of the invoice
export function getActionSubject({ confirmation }: { confirmation: ToolConfirmation }) {
  const args = confirmation.args as Args;

  return asText(args.name) ?? asText(args.number) ?? asText(args.description);
}

function getAddress(args: Args) {
  const postalAndCity = [asText(args.postalCode), asText(args.city)].filter(Boolean).join(' ');
  const parts = [asText(args.addressLine1), asText(args.addressLine2), postalAndCity, asText(args.region)].filter(part => part !== undefined && part !== '');

  return parts.length > 0 ? parts.join(', ') : undefined;
}

function formatMoney({ amount, currency, locale }: { amount: number; currency: string; locale: string }) {
  try {
    return new Intl.NumberFormat(locale, { style: 'currency', currency }).format(amount);
  } catch {
    return `${amount.toFixed(2)} ${currency}`;
  }
}

type Line = { quantity?: number; unitPrice?: number; taxRatePercent?: number; discountPercent?: number };

function getLinesTotal(lines: Line[]) {
  return lines.reduce((total, line) => {
    const base = (line.quantity ?? 1) * (line.unitPrice ?? 0) * (1 - (line.discountPercent ?? 0) / 100);
    return total + base * (1 + (line.taxRatePercent ?? 0) / 100);
  }, 0);
}

function formatValue({ key, value, args, t, locale }: { key: string; value: unknown; args: Args; t: Translate; locale: string }): string | undefined {
  const currency = asText(args.currency) ?? 'EUR';

  if (value === undefined || value === null || value === '') {
    return undefined;
  }
  if (typeof value === 'boolean') {
    return value ? t('ai-assistant.approval.yes') : undefined;
  }
  if (key === 'paymentTermsDays' && typeof value === 'number') {
    return t('ai-assistant.approval.days', { count: value });
  }
  if ((key === 'unitPrice') && typeof value === 'number') {
    return formatMoney({ amount: value, currency, locale });
  }
  if ((key === 'taxRatePercent' || key === 'withholdingPercent') && typeof value === 'number') {
    return `${value} %`;
  }
  if (key === 'classification' && typeof value === 'string') {
    const labelKey = getClassificationLabelKey(value);
    return labelKey ? t(labelKey) : value;
  }
  if (key === 'items' && Array.isArray(value)) {
    return t('ai-assistant.approval.lines-total', { count: value.length, total: formatMoney({ amount: getLinesTotal(value as Line[]), currency, locale }) });
  }
  if (key === 'conditions' && Array.isArray(value)) {
    return (value as Array<{ field: string; operator: string; value: string }>).map(condition => `${condition.field} ${condition.operator} "${condition.value}"`).join(args.conditionMatchMode === 'any' ? ' · ' : ' + ');
  }
  if (Array.isArray(value) || typeof value === 'object') {
    return undefined;
  }

  return String(value);
}

function humanizeKey(key: string) {
  const words = key.replace(/([a-z])([A-Z])/g, '$1 $2').replace(/_/g, ' ').toLowerCase();
  return words.charAt(0).toUpperCase() + words.slice(1);
}

// Every value the action carries, as label and value, in the order the model wrote them
export function getActionDetails({ confirmation, t, locale }: { confirmation: ToolConfirmation; t: Translate; locale: string }) {
  const args = confirmation.args as Args;
  const subject = getActionSubject({ confirmation });
  const details: Array<{ label: string; value: string }> = [];
  let hasAddress = false;

  for (const [key, value] of Object.entries(args)) {
    if (['addressLine1', 'addressLine2', 'postalCode', 'city', 'region'].includes(key) && !hasAddress) {
      hasAddress = true;
      const address = getAddress(args);
      if (address !== undefined) {
        details.push({ label: t(FIELD_LABEL_KEYS.address!), value: address });
      }
      continue;
    }

    if (HIDDEN_FIELDS.has(key) || (key !== 'taxId' && key.endsWith('Id')) || (typeof value === 'string' && value === subject)) {
      continue;
    }

    const formatted = formatValue({ key, value, args, t, locale });
    if (formatted !== undefined) {
      details.push({ label: FIELD_LABEL_KEYS[key] ? t(FIELD_LABEL_KEYS[key]) : humanizeKey(key), value: formatted });
    }
  }

  return details;
}

// The few facts that identify it at a glance, under the title
function getActionHighlights({ confirmation, t, locale }: { confirmation: ToolConfirmation; t: Translate; locale: string }) {
  const args = confirmation.args as Args;
  const preferred = ['taxId', 'number', 'issueDate', 'items', 'unitPrice', 'classification', 'conditions'];
  const details = getActionDetails({ confirmation, t, locale });
  const byLabel = new Map(details.map(detail => [detail.label, detail.value]));
  const highlights = preferred
    .filter(key => args[key] !== undefined)
    .map(key => byLabel.get(FIELD_LABEL_KEYS[key] ? t(FIELD_LABEL_KEYS[key]) : humanizeKey(key)))
    .filter((value): value is string => value !== undefined);
  const place = [asText(args.city), asText(args.region)].filter(Boolean).join(', ');

  return [...highlights, ...(place === '' ? [] : [place])].slice(0, 3);
}

function ActionRow(props: {
  confirmation: ToolConfirmation;
  isBusy: boolean;
  error?: string;
  // More actions waiting after this one: they can all be approved at once
  approveAllCount?: number;
  onApprove: () => void;
  onReject: () => void;
  onApproveAll?: () => void;
}) {
  const { t, getLocale } = useI18n();
  const [showDetails, setShowDetails] = createSignal(false);
  const subject = () => getActionSubject({ confirmation: props.confirmation });
  const highlights = () => getActionHighlights({ confirmation: props.confirmation, t, locale: getLocale() });
  const details = () => getActionDetails({ confirmation: props.confirmation, t, locale: getLocale() });
  const isDestructive = () => isDestructiveAction({ confirmation: props.confirmation });

  return (
    <div class="flex flex-col gap-2">
      <div class="flex items-start gap-2.5">
        <div class={cn('mt-0.5 flex size-8 shrink-0 items-center justify-center rounded-lg', isDestructive() ? 'bg-destructive/10 text-destructive' : 'bg-primary/10 text-primary')}>
          <div class={cn(getActionIcon({ confirmation: props.confirmation }), 'size-4')} />
        </div>
        <div class="min-w-0 flex-1">
          <div class={cn('text-sm leading-snug [overflow-wrap:anywhere]', !showDetails() && 'line-clamp-2')} title={subject()}>
            <span class="text-muted-foreground">{getActionLabel({ confirmation: props.confirmation, t })}</span>
            <Show when={subject()}>
              <span class="font-medium text-foreground">{` · ${subject()}`}</span>
            </Show>
          </div>
          <div class="mt-0.5 flex flex-wrap items-center gap-x-1.5 text-xs text-muted-foreground">
            <For each={highlights()}>
              {(highlight, index) => (
                <>
                  <Show when={index() > 0}><span aria-hidden="true">·</span></Show>
                  <span class="truncate">{highlight}</span>
                </>
              )}
            </For>
            <Show when={details().length > 0}>
              <Show when={highlights().length > 0}><span aria-hidden="true">·</span></Show>
              <button type="button" class="inline-flex min-h-11 items-center sm:min-h-0 font-medium text-foreground/70 underline-offset-2 hover:text-foreground hover:underline" aria-expanded={showDetails()} onClick={() => setShowDetails(open => !open)}>
                {showDetails() ? t('ai-assistant.approval.hide-details') : t('ai-assistant.approval.show-details')}
              </button>
            </Show>
          </div>
          <Show when={isDestructive()}>
            <div class="mt-1 text-xs text-destructive [overflow-wrap:anywhere]">{t('ai-assistant.approval.irreversible')}</div>
          </Show>
          <Show when={props.error}>
            <div class="mt-1 text-xs text-destructive [overflow-wrap:anywhere]">{t('ai-assistant.approval.failed', { message: props.error! })}</div>
          </Show>
        </div>
      </div>

      <Show when={showDetails()}>
        <dl class="ml-0 sm:ml-10.5 grid grid-cols-[minmax(0,1fr)_minmax(0,2fr)] gap-x-3 gap-y-1 text-xs">
          <For each={details()}>
            {detail => (
              <>
                <dt class="text-muted-foreground [overflow-wrap:anywhere]">{detail.label}</dt>
                <dd class="min-w-0 [overflow-wrap:anywhere] text-foreground">{detail.value}</dd>
              </>
            )}
          </For>
        </dl>
      </Show>

      <div class="ml-0 sm:ml-10.5 flex flex-wrap gap-2">
        <Button size="sm" class="h-11 flex-1 sm:flex-none sm:h-7 gap-1 px-3 sm:px-2.5 text-sm sm:text-xs" variant={isDestructive() ? 'destructive' : 'default'} onClick={() => props.onApprove()} disabled={props.isBusy} isLoading={props.isBusy}>
          <div class="i-tabler-check size-3.5" />
          {props.error ? t('ai-assistant.approval.retry') : t('ai-assistant.approval.approve')}
        </Button>
        <Button size="sm" variant="outline" class="h-11 flex-1 sm:flex-none sm:h-7 gap-1 px-3 sm:px-2.5 text-sm sm:text-xs" onClick={() => props.onReject()} disabled={props.isBusy}>
          <div class="i-tabler-x size-3.5" />
          {t('ai-assistant.approval.reject')}
        </Button>
        <Show when={(props.approveAllCount ?? 0) > 1}>
          <Button size="sm" variant="ghost" class="h-11 w-full sm:w-auto sm:h-7 px-3 sm:px-2.5 text-sm sm:text-xs" onClick={() => props.onApproveAll?.()} disabled={props.isBusy}>
            {t('ai-assistant.approval.approve-all', { count: props.approveAllCount! })}
          </Button>
        </Show>
      </div>
    </div>
  );
}

// Docked right above the input: what the assistant wants to do and needs a yes for. "Something else" hands the
// word back to the user, whose next message turns down what is still pending.
export function PendingActionsBar(props: {
  confirmations: ToolConfirmation[];
  busyIds: string[];
  errors?: Record<string, string>;
  onApprove: (confirmation: ToolConfirmation) => void;
  onApproveAll: () => void;
  onReject: (confirmation: ToolConfirmation) => void;
  onSomethingElse: () => void;
}) {
  const { t } = useI18n();

  // One at a time, the next one shows once this one is answered: the bar stays small on a phone
  const current = () => props.confirmations[0];

  return (
    <div class="mb-2 flex min-h-0 flex-col gap-2 overflow-y-auto overscroll-contain rounded-2xl border bg-background px-3 py-2.5 shadow-sm" role="region" aria-label={t('ai-assistant.approval.title')}>
      <div class="flex shrink-0 items-center justify-between gap-2">
        <div class="flex min-w-0 items-center gap-1.5">
          <span class="truncate text-xs font-medium text-muted-foreground">{t('ai-assistant.approval.title')}</span>
          <Show when={props.confirmations.length > 1}>
            <span class="shrink-0 rounded-full bg-primary/10 px-1.5 text-[11px] font-medium leading-5 text-primary" aria-label={t('ai-assistant.approval.pending-count', { count: props.confirmations.length })}>
              {props.confirmations.length}
            </span>
          </Show>
        </div>
        <Button size="sm" variant="ghost" class="-mr-1.5 h-9 shrink-0 gap-1 px-2 text-xs sm:h-7" onClick={() => props.onSomethingElse()} disabled={props.busyIds.length > 0}>
          <div class="i-tabler-message-2 size-3.5" />
          {t('ai-assistant.approval.something-else')}
        </Button>
      </div>
      <Show when={current()} keyed>
        {confirmation => (
          <ActionRow
            confirmation={confirmation}
            isBusy={props.busyIds.length > 0}
            error={props.errors?.[confirmation.toolCallId]}
            approveAllCount={props.confirmations.length}
            onApprove={() => props.onApprove(confirmation)}
            onReject={() => props.onReject(confirmation)}
            onApproveAll={() => props.onApproveAll()}
          />
        )}
      </Show>
    </div>
  );
}

export function getActionFailure({ confirmation }: { confirmation: ToolConfirmation }) {
  const result = confirmation.result as { success?: boolean; error?: unknown } | undefined;

  if (result === undefined || result === null || typeof result !== 'object') {
    return undefined;
  }
  if (result.success === false || result.error !== undefined) {
    return typeof result.error === 'string' ? result.error : 'Error';
  }

  return undefined;
}

// In the conversation, once answered: one quiet line saying what was done or turned down
export function ResolvedActionLine(props: { confirmation: ToolConfirmation }) {
  const { t } = useI18n();
  const subject = () => getActionSubject({ confirmation: props.confirmation });
  const failure = () => getActionFailure({ confirmation: props.confirmation });
  const state = () => (props.confirmation.status === 'rejected' ? 'rejected' : failure() !== undefined ? 'failed' : 'done');

  return (
    <div class="not-prose mt-2 flex items-start gap-2 text-xs">
      <div class={cn('mt-px size-3.5 shrink-0', {
        'i-tabler-circle-check text-green-600': state() === 'done',
        'i-tabler-circle-x text-muted-foreground': state() === 'rejected',
        'i-tabler-alert-circle text-destructive': state() === 'failed',
      })}
      />
      <div class={cn('min-w-0 [overflow-wrap:anywhere]', state() === 'rejected' ? 'text-muted-foreground' : 'text-foreground')}>
        <span>{getActionLabel({ confirmation: props.confirmation, t })}</span>
        <Show when={subject()}>
          <span class="font-medium">{` · ${subject()}`}</span>
        </Show>
        <span class={cn('ml-1.5', state() === 'failed' ? 'text-destructive' : 'text-muted-foreground')}>
          {state() === 'done' ? t('ai-assistant.approval.done') : state() === 'rejected' ? t('ai-assistant.approval.rejected') : t('ai-assistant.approval.failed', { message: failure()! })}
        </span>
      </div>
    </div>
  );
}
