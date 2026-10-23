import type { ExistingPolicy, ImportRow, RowIssue } from '../data-imports.models';
import type { ContactRoles, DataImportEntity, DataImportProposal, ImportedContact, ImportedProduct } from '../data-imports.types';
import type { TranslationKeys } from '@/modules/i18n/locales.types';
import { createMemo, createSignal, For, Match, Show, Switch } from 'solid-js';
import { getContactsQueryKey } from '@/modules/contacts/contacts.services';
import { useI18n } from '@/modules/i18n/i18n.provider';
import { getProductsQueryKey } from '@/modules/invoicing/components/product-form';
import { queryClient } from '@/modules/shared/query/query-client';
import { cn } from '@/modules/shared/style/cn';
import { get } from '@/modules/shared/utils/get';
import { Button } from '@/modules/ui/components/button';
import { ResponsiveDialog } from '@/modules/ui/components/responsive-dialog';
import { SimpleCheckbox } from '@/modules/ui/components/simple-checkbox';
import { SimpleSelect } from '@/modules/ui/components/simple-select';
import { createToast } from '@/modules/ui/components/sonner';
import { buildContactRows, buildProductRows, DATA_IMPORT_FIELDS, DATA_IMPORT_FILE_ACCEPT, getColumnSamples, setColumnField, summarizeRows } from '../data-imports.models';
import { analyzeDataImport, confirmContactsImport, confirmProductsImport, uploadDataImportFile } from '../data-imports.services';

type Step = 'pick' | 'reading' | 'review';

const IGNORE_COLUMN = '';
const PREVIEW_ROWS = 100;

const money = (minor: number | null) => (minor === null ? '—' : (minor / 100).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 }));

// The export of another software (an address book, a catalog): the AI says which column is which, the app reads every
// row, finds what already exists and the user reviews it all before anything is saved
export function DataImportDialog(props: {
  organizationId: string;
  entity: DataImportEntity;
  defaultRoles?: ContactRoles;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const { t } = useI18n();
  const [step, setStep] = createSignal<Step>('pick');
  const [isDragging, setIsDragging] = createSignal(false);
  const [documentId, setDocumentId] = createSignal<string | null>(null);
  const [proposal, setProposal] = createSignal<DataImportProposal | null>(null);
  const [mapping, setMapping] = createSignal<Array<string | null>>([]);
  const [existingPolicy, setExistingPolicy] = createSignal<ExistingPolicy>('update');
  const [roles, setRoles] = createSignal<ContactRoles>(props.defaultRoles ?? { isCustomer: true, isSupplier: false, isSalesRepresentative: false });
  const [isSaving, setIsSaving] = createSignal(false);
  let fileInput: HTMLInputElement | undefined;

  const reset = () => {
    setStep('pick');
    setProposal(null);
    setDocumentId(null);
  };

  const onOpenChange = (open: boolean) => {
    if (!open && (step() === 'reading' || isSaving())) {
      return;
    }
    props.onOpenChange(open);
    if (!open) {
      reset();
    }
  };

  const showReadError = (error: unknown) => {
    const code = get(error, ['data', 'error', 'code']);
    createToast({ type: 'error', message: t(code === 'data_import.unreadable' ? 'data-import.toast.unreadable' : code === 'data_import.empty' ? 'data-import.toast.empty' : 'data-import.toast.read-error') });
  };

  const analyze = async ({ id, sheetName }: { id: string; sheetName?: string }) => {
    setStep('reading');
    try {
      const result = await analyzeDataImport({ organizationId: props.organizationId, documentId: id, entity: props.entity, sheetName });
      setProposal(result);
      setMapping(result.mapping);
      setStep('review');
    } catch (error) {
      showReadError(error);
      setStep(proposal() ? 'review' : 'pick');
    }
  };

  const read = async (file: File | undefined) => {
    if (!file) {
      return;
    }
    setStep('reading');
    try {
      const { documentId: id } = await uploadDataImportFile({ organizationId: props.organizationId, file });
      setDocumentId(id);
      await analyze({ id });
    } catch (error) {
      showReadError(error);
      setStep('pick');
    }
  };

  const rows = createMemo((): Array<ImportRow<ImportedContact> | ImportRow<ImportedProduct>> => {
    const current = proposal();
    if (!current) {
      return [];
    }
    return props.entity === 'contacts'
      ? buildContactRows({ proposal: current, mapping: mapping(), existingPolicy: existingPolicy() })
      : buildProductRows({ proposal: current, mapping: mapping(), existingPolicy: existingPolicy() });
  });
  const summary = createMemo(() => summarizeRows(rows()));
  const hasName = () => mapping().includes('name');
  const hasRole = () => props.entity !== 'contacts' || Object.values(roles()).some(Boolean);
  const importCount = () => summary().create + summary().update;

  const save = async () => {
    const toImport = rows().filter(row => row.status !== 'skip').map(row => row.record);
    if (toImport.length === 0 || !hasRole()) {
      return;
    }
    setIsSaving(true);

    try {
      const result = props.entity === 'contacts'
        ? await confirmContactsImport({ organizationId: props.organizationId, roles: roles(), contacts: toImport as ImportedContact[] })
        : await confirmProductsImport({ organizationId: props.organizationId, products: toImport as ImportedProduct[] });
      await queryClient.invalidateQueries({ queryKey: props.entity === 'contacts' ? getContactsQueryKey({ organizationId: props.organizationId }) : getProductsQueryKey({ organizationId: props.organizationId }) });
      createToast({ type: 'success', message: t('data-import.toast.imported', { created: result.createdCount, updated: result.updatedCount }) });
      setIsSaving(false);
      onOpenChange(false);
    } catch {
      createToast({ type: 'error', message: t('data-import.toast.import-error') });
      setIsSaving(false);
    }
  };

  const fieldLabel = (field: string) => t(`data-import.field.${props.entity}.${field}` as TranslationKeys);
  const fieldOptions = () => [
    { value: IGNORE_COLUMN, label: t('data-import.mapping.ignore') },
    ...DATA_IMPORT_FIELDS[props.entity].map(field => ({ value: field, label: fieldLabel(field) })),
  ];
  const warningMessages = () => (proposal()?.warnings ?? []).map(warning => t(`data-import.warning.${warning}` as TranslationKeys));
  const previewFields = () => DATA_IMPORT_FIELDS[props.entity].filter(field => mapping().includes(field));

  const recordValue = (row: ImportRow<ImportedContact> | ImportRow<ImportedProduct>, field: string) => {
    const record = row.record as Record<string, unknown>;
    if (field === 'unitPrice') {
      return money(record.unitPriceMinor as number | null);
    }
    if (field === 'taxRate') {
      return record.taxRateBps === null ? '—' : `${(record.taxRateBps as number) / 100} %`;
    }
    const value = record[field];
    return value === null || value === '' ? '—' : String(value);
  };

  return (
    <>
      <input
        ref={fileInput}
        type="file"
        class="hidden"
        accept={DATA_IMPORT_FILE_ACCEPT}
        onChange={(event) => {
          const [file] = [...(event.currentTarget.files ?? [])];
          event.currentTarget.value = '';
          void read(file);
        }}
      />

      <ResponsiveDialog
        open={props.open}
        onOpenChange={onOpenChange}
        class={step() === 'review' ? 'max-w-5xl' : undefined}
        title={t(`data-import.${props.entity}.dialog-title`)}
        description={step() === 'review' ? t('data-import.review.description', { name: proposal()?.fileName ?? '', count: proposal()?.rows.length ?? 0 }) : t(`data-import.${props.entity}.dialog-description`)}
      >
        <Switch>
          <Match when={step() === 'pick'}>
            <button
              type="button"
              class={cn('flex w-full flex-col items-center justify-center gap-2 rounded-xl border-2 border-dashed px-6 py-10 text-center text-muted-foreground transition-colors hover:border-primary/50', isDragging() && 'border-primary bg-primary/5')}
              onClick={() => fileInput?.click()}
              onDragOver={(event) => {
                event.preventDefault();
                setIsDragging(true);
              }}
              onDragLeave={() => setIsDragging(false)}
              onDrop={(event) => {
                event.preventDefault();
                setIsDragging(false);
                void read(event.dataTransfer?.files[0]);
              }}
            >
              <div class="i-tabler-table-import size-8" />
              <span class="text-sm font-medium text-foreground">{t('data-import.pick.drop')}</span>
              <span class="text-xs">{t('data-import.pick.formats')}</span>
            </button>
          </Match>

          <Match when={step() === 'reading'}>
            <div class="flex flex-col items-center gap-3 py-12 text-center">
              <div class="i-tabler-loader-2 size-7 animate-spin text-muted-foreground" />
              <p class="text-sm font-medium">{t('data-import.reading.title')}</p>
              <p class="text-xs text-muted-foreground">{t('data-import.reading.description')}</p>
            </div>
          </Match>

          <Match when={step() === 'review' && proposal()}>
            {getProposal => (
              <div class="flex min-w-0 flex-col gap-6">
                <Show when={warningMessages().length > 0}>
                  <div class="rounded-lg bg-amber-500/10 px-3 py-2 text-xs text-amber-700 dark:text-amber-300">
                    <For each={warningMessages()}>{warning => <p>{warning}</p>}</For>
                  </div>
                </Show>

                <Show when={getProposal().sheets.length > 1}>
                  <section class="flex flex-col gap-1">
                    <h3 class="text-sm font-semibold">{t('data-import.sheet.title')}</h3>
                    <SimpleSelect
                      class="sm:max-w-xs"
                      options={getProposal().sheets.map(sheet => ({ value: sheet.name, label: t('data-import.sheet.option', { name: sheet.name, count: sheet.rowCount }) }))}
                      value={getProposal().sheetName}
                      aria-label={t('data-import.sheet.title')}
                      onChange={(sheetName) => {
                        const id = documentId();
                        if (id) {
                          void analyze({ id, sheetName });
                        }
                      }}
                    />
                  </section>
                </Show>

                <section class="flex flex-col gap-2">
                  <div>
                    <h3 class="text-sm font-semibold">{t('data-import.mapping.title')}</h3>
                    <p class="text-xs text-muted-foreground">{t(getProposal().detectedWith === 'ai' ? 'data-import.mapping.description-ai' : 'data-import.mapping.description-rules', { row: getProposal().headerRow })}</p>
                  </div>
                  <div class="divide-y border-y">
                    <For each={getProposal().headers}>
                      {(header, column) => (
                        <div class="flex flex-col gap-2 py-2 sm:flex-row sm:items-center">
                          <div class="min-w-0 flex-1">
                            <p class="truncate text-sm font-medium">{header === '' ? t('data-import.mapping.untitled', { index: column() + 1 }) : header}</p>
                            <p class="truncate text-xs text-muted-foreground">{getColumnSamples({ rows: getProposal().rows, column: column() }).join(' · ') || '—'}</p>
                          </div>
                          <SimpleSelect
                            class="sm:w-56"
                            triggerClass="h-8 text-xs"
                            options={fieldOptions()}
                            value={mapping()[column()] ?? IGNORE_COLUMN}
                            aria-label={header}
                            onChange={value => setMapping(current => setColumnField({ mapping: current, column: column(), field: value === IGNORE_COLUMN ? null : value }))}
                          />
                        </div>
                      )}
                    </For>
                  </div>
                  <Show when={!hasName()}>
                    <p class="text-xs text-destructive">{t('data-import.mapping.name-required')}</p>
                  </Show>
                </section>

                <section class="flex flex-col gap-3">
                  <h3 class="text-sm font-semibold">{t('data-import.options.title')}</h3>
                  <Show when={props.entity === 'contacts'}>
                    <div class="flex flex-col gap-1">
                      <p class="text-xs text-muted-foreground">{t('data-import.options.roles')}</p>
                      <div class="flex flex-wrap gap-x-5 gap-y-2">
                        <SimpleCheckbox label={t('contacts.roles.customers')} checked={roles().isCustomer} onChange={checked => setRoles(current => ({ ...current, isCustomer: checked }))} />
                        <SimpleCheckbox label={t('contacts.roles.suppliers')} checked={roles().isSupplier} onChange={checked => setRoles(current => ({ ...current, isSupplier: checked }))} />
                        <SimpleCheckbox label={t('contacts.roles.sales_representatives')} checked={roles().isSalesRepresentative} onChange={checked => setRoles(current => ({ ...current, isSalesRepresentative: checked }))} />
                      </div>
                    </div>
                  </Show>
                  <div class="flex flex-col gap-1">
                    <p class="text-xs text-muted-foreground">{t(`data-import.options.existing.${props.entity}`, { count: rows().filter(row => row.existingName !== null).length })}</p>
                    <SimpleSelect
                      class="sm:max-w-sm"
                      options={[{ value: 'update', label: t('data-import.options.existing.update') }, { value: 'skip', label: t('data-import.options.existing.skip') }]}
                      value={existingPolicy()}
                      aria-label={t('data-import.options.title')}
                      onChange={value => setExistingPolicy(value as ExistingPolicy)}
                    />
                  </div>
                </section>

                <Show when={hasName()}>
                  <section class="flex min-w-0 flex-col gap-2">
                    <h3 class="text-sm font-semibold">{t('data-import.preview.title')}</h3>
                    <div class="overflow-x-auto rounded-lg border">
                      <table class="w-full min-w-max text-sm">
                        <thead>
                          <tr class="border-b text-left text-xs text-muted-foreground">
                            <th class="px-3 py-2 font-medium">{t('data-import.preview.status')}</th>
                            <For each={previewFields()}>{field => <th class="px-3 py-2 font-medium">{fieldLabel(field)}</th>}</For>
                          </tr>
                        </thead>
                        <tbody class="divide-y">
                          <For each={rows().slice(0, PREVIEW_ROWS)}>
                            {row => (
                              <tr class={cn(row.status === 'skip' && 'text-muted-foreground')}>
                                <td class="px-3 py-1.5 align-top">
                                  <RowStatusLabel status={row.status} existingName={row.existingName} issues={row.issues} />
                                </td>
                                <For each={previewFields()}>
                                  {field => <td class="max-w-64 truncate px-3 py-1.5 align-top">{recordValue(row, field)}</td>}
                                </For>
                              </tr>
                            )}
                          </For>
                        </tbody>
                      </table>
                    </div>
                    <Show when={rows().length > PREVIEW_ROWS}>
                      <p class="text-xs text-muted-foreground">{t('data-import.preview.more', { count: rows().length - PREVIEW_ROWS })}</p>
                    </Show>
                  </section>
                </Show>

                <div class="sticky bottom-0 z-10 -mx-1 flex flex-col gap-2 bg-card px-1 py-2 md:flex-row md:items-center">
                  <p class="flex-1 text-xs text-muted-foreground">{t('data-import.summary', summary())}</p>
                  <div class="flex gap-2">
                    <Button variant="outline" class="flex-1 md:flex-none" onClick={reset} disabled={isSaving()}>{t('data-import.back')}</Button>
                    <Button variant="primary" class="flex-1 md:flex-none" onClick={save} isLoading={isSaving()} disabled={!hasName() || !hasRole() || importCount() === 0}>
                      {t('data-import.confirm', { count: importCount() })}
                    </Button>
                  </div>
                </div>
              </div>
            )}
          </Match>
        </Switch>
      </ResponsiveDialog>
    </>
  );
}

function RowStatusLabel(props: { status: ImportRow<unknown>['status']; existingName: string | null; issues: RowIssue[] }) {
  const { t } = useI18n();
  const blockingIssue = () => props.issues.find(issue => issue === 'missing_name' || issue === 'duplicate_in_file');
  const otherIssues = () => props.issues.filter(issue => issue !== blockingIssue());

  return (
    <div class="flex flex-col gap-0.5 text-xs">
      <span class={cn('font-medium', props.status === 'create' && 'text-emerald-700 dark:text-emerald-300', props.status === 'update' && 'text-sky-700 dark:text-sky-300')}>
        <Switch>
          <Match when={blockingIssue()}>{issue => t(`data-import.issue.${issue()}` as TranslationKeys)}</Match>
          <Match when={props.status === 'create'}>{t('data-import.status.create')}</Match>
          <Match when={props.status === 'update'}>{t('data-import.status.update', { name: props.existingName ?? '' })}</Match>
          <Match when={props.status === 'skip'}>{t('data-import.status.exists', { name: props.existingName ?? '' })}</Match>
        </Switch>
      </span>
      <For each={otherIssues()}>{issue => <span class="text-amber-700 dark:text-amber-300">{t(`data-import.issue.${issue}` as TranslationKeys)}</span>}</For>
    </div>
  );
}
