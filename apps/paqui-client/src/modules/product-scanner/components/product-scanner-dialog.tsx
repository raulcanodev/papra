import type { ProductScanField, ProductScanProposal } from '../product-scanner.types';
import type { TranslationKeys } from '@/modules/i18n/locales.types';
import { useQuery } from '@tanstack/solid-query';
import { createMemo, createSignal, For, Match, Show, Switch } from 'solid-js';
import { preparePhotoForUpload } from '@/modules/captures/captures.models';
import { fetchCustomPropertyDefinitions } from '@/modules/custom-properties/custom-properties.services';
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
import { buildCatalogImportInput, formatScanFieldValue, MAX_SCANNED_FILES, SCANNABLE_FILE_ACCEPT } from '../product-scanner.models';
import { importProductCatalog, scanProductCatalog } from '../product-scanner.services';

type Step = 'pick' | 'reading' | 'review';

const CREATE_FIELD_VALUE = '';

function getFileIcon({ file }: { file: File }) {
  if (file.type.startsWith('image/')) {
    return 'i-tabler-photo';
  }

  return /\.(?:xlsx|xlsm|csv|tsv|ods)$/i.test(file.name) ? 'i-tabler-table' : 'i-tabler-file-text';
}

// A supplier sends its catalog (photos of the pages, a PDF, a spreadsheet): the AI lists its products, filling the
// product fields the organization already has, and the user reviews everything before it is saved
export function ProductScannerDialog(props: { organizationId: string; contactId: string; contactName: string; open: boolean; onOpenChange: (open: boolean) => void }) {
  const { t } = useI18n();
  const [step, setStep] = createSignal<Step>('pick');
  const [files, setFiles] = createSignal<File[]>([]);
  const [isDragging, setIsDragging] = createSignal(false);
  const [proposal, setProposal] = createSignal<ProductScanProposal | null>(null);
  const [selected, setSelected] = createSignal<ReadonlySet<number>>(new Set());
  const [fieldTargets, setFieldTargets] = createSignal<Record<string, string>>({});
  const [isSaving, setIsSaving] = createSignal(false);
  let fileInput: HTMLInputElement | undefined;
  let cameraInput: HTMLInputElement | undefined;

  const definitionsQuery = useQuery(() => ({
    queryKey: ['organizations', props.organizationId, 'custom-properties', { entityType: 'product' }],
    queryFn: () => fetchCustomPropertyDefinitions({ organizationId: props.organizationId, entityType: 'product' }),
    enabled: props.open,
  }));

  const reset = () => {
    setStep('pick');
    setFiles([]);
    setProposal(null);
    setSelected(new Set<number>());
    setFieldTargets({});
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

  const addFiles = async (added: File[]) => {
    const prepared = await Promise.all(added.map(async file => preparePhotoForUpload({ file })));
    setFiles(current => [...current, ...prepared].slice(0, MAX_SCANNED_FILES));
  };

  const readCatalog = async () => {
    setStep('reading');

    try {
      const result = await scanProductCatalog({ organizationId: props.organizationId, contactId: props.contactId, files: files() });

      if (result.products.length === 0) {
        createToast({ type: 'error', message: t('product-scanner.toast.no-products') });
        setStep('pick');
        return;
      }

      setProposal(result);
      setSelected(new Set(result.products.map((_, index) => index)));
      setStep('review');
    } catch (error) {
      const code = get(error, ['data', 'error', 'code']);
      createToast({ type: 'error', message: t(code === 'ai_assistant.not_configured' ? 'product-scanner.toast.not-configured' : code === 'product_catalog.unreadable' ? 'product-scanner.toast.unreadable' : 'product-scanner.toast.read-error') });
      setStep('pick');
    }
  };

  const newFields = createMemo(() => proposal()?.fields.filter(field => field.status === 'new') ?? []);
  const fieldsByRef = createMemo(() => new Map((proposal()?.fields ?? []).map(field => [field.ref, field])));

  // A new field can go to an existing product field of the same type instead of being created
  const getTargetOptions = (field: ProductScanField) => [
    { value: CREATE_FIELD_VALUE, label: t('product-scanner.review.create-field') },
    ...(definitionsQuery.data?.propertyDefinitions ?? [])
      .filter(definition => definition.type === field.type)
      .map(definition => ({ value: definition.id, label: t('product-scanner.review.use-field', { name: definition.name }) })),
  ];

  const toggleProduct = (index: number, checked: boolean) => {
    const next = new Set(selected());
    if (checked) {
      next.add(index);
    } else {
      next.delete(index);
    }
    setSelected(next);
  };

  const save = async () => {
    const current = proposal();
    if (!current || selected().size === 0) {
      return;
    }

    setIsSaving(true);

    try {
      const { createdCount, updatedCount } = await importProductCatalog({
        organizationId: props.organizationId,
        contactId: props.contactId,
        input: buildCatalogImportInput({ proposal: current, selectedIndexes: selected(), fieldTargets: fieldTargets() }),
      });

      await Promise.all([
        queryClient.invalidateQueries({ queryKey: getProductsQueryKey({ organizationId: props.organizationId }) }),
        queryClient.invalidateQueries({ queryKey: ['organizations', props.organizationId, 'custom-properties'] }),
      ]);

      createToast({ type: 'success', message: t('product-scanner.toast.imported', { created: createdCount, updated: updatedCount }) });
      setIsSaving(false);
      onOpenChange(false);
    } catch {
      createToast({ type: 'error', message: t('product-scanner.toast.import-error') });
      setIsSaving(false);
    }
  };

  const money = (minor: number, currency: string) => new Intl.NumberFormat('es-ES', { style: 'currency', currency }).format(minor / 100);
  const typeLabel = (field: ProductScanField) => t(`custom-properties.types.${field.type}` as TranslationKeys);

  return (
    <>
      <input
        ref={fileInput}
        type="file"
        class="hidden"
        multiple
        accept={SCANNABLE_FILE_ACCEPT}
        onChange={(event) => {
          const added = [...(event.currentTarget.files ?? [])];
          event.currentTarget.value = '';
          void addFiles(added);
        }}
      />
      <input
        ref={cameraInput}
        type="file"
        class="hidden"
        accept="image/*"
        capture="environment"
        onChange={(event) => {
          const added = [...(event.currentTarget.files ?? [])];
          event.currentTarget.value = '';
          void addFiles(added);
        }}
      />

      <ResponsiveDialog
        open={props.open}
        onOpenChange={onOpenChange}
        title={t('product-scanner.title')}
        description={step() === 'review' ? t('product-scanner.review.description', { name: props.contactName }) : t('product-scanner.description')}
      >
        <Switch>
          <Match when={step() === 'pick'}>
            <div class="flex flex-col gap-3">
              {/* Phones: take photos of the pages or pick a file, like the "+" of the bottom bar */}
              <div class="grid grid-cols-2 gap-2.5 md:hidden">
                <button type="button" class="flex min-h-24 flex-col items-start justify-between gap-3 rounded-2xl bg-primary p-3.5 text-left text-primary-foreground transition-transform active:scale-98" onClick={() => cameraInput?.click()}>
                  <div class="i-tabler-camera size-6" />
                  <span class="text-[15px] font-semibold">{t('product-scanner.pick.camera')}</span>
                </button>
                <button type="button" class="flex min-h-24 flex-col items-start justify-between gap-3 rounded-2xl bg-muted p-3.5 text-left transition-transform active:scale-98" onClick={() => fileInput?.click()}>
                  <div class="i-tabler-upload size-6" />
                  <span class="text-[15px] font-semibold">{t('product-scanner.pick.file')}</span>
                </button>
              </div>

              <button
                type="button"
                class={cn('hidden flex-col items-center justify-center gap-2 rounded-xl border-2 border-dashed px-6 py-10 text-center text-muted-foreground transition-colors hover:border-primary/50 md:flex', isDragging() && 'border-primary bg-primary/5')}
                onClick={() => fileInput?.click()}
                onDragOver={(event) => {
                  event.preventDefault();
                  setIsDragging(true);
                }}
                onDragLeave={() => setIsDragging(false)}
                onDrop={(event) => {
                  event.preventDefault();
                  setIsDragging(false);
                  void addFiles([...(event.dataTransfer?.files ?? [])]);
                }}
              >
                <div class="i-tabler-file-upload size-8" />
                <span class="text-sm font-medium text-foreground">{t('product-scanner.pick.drop')}</span>
                <span class="text-xs">{t('product-scanner.pick.formats')}</span>
              </button>

              <Show when={files().length > 0}>
                <ul class="flex flex-col divide-y rounded-xl border">
                  <For each={files()}>
                    {(file, index) => (
                      <li class="flex items-center gap-2.5 px-3 py-2 text-sm">
                        <div class={cn(getFileIcon({ file }), 'size-4.5 shrink-0 text-muted-foreground')} />
                        <span class="min-w-0 flex-1 truncate">{file.name}</span>
                        <button type="button" class="flex size-7 items-center justify-center rounded-md text-muted-foreground hover:bg-muted" aria-label={t('product-scanner.pick.remove')} onClick={() => setFiles(current => current.filter((_, position) => position !== index()))}>
                          <div class="i-tabler-x size-4" />
                        </button>
                      </li>
                    )}
                  </For>
                </ul>
              </Show>

              <Button variant="primary" class="mt-1 w-full gap-2" disabled={files().length === 0} onClick={readCatalog}>
                <div class="i-tabler-sparkles size-4" />
                {t('product-scanner.pick.read')}
              </Button>
            </div>
          </Match>

          <Match when={step() === 'reading'}>
            <div class="flex flex-col items-center gap-3 py-12 text-center">
              <div class="i-tabler-loader-2 size-7 animate-spin text-muted-foreground" />
              <p class="text-sm font-medium">{t('product-scanner.reading.title')}</p>
              <p class="text-xs text-muted-foreground">{t('product-scanner.reading.description')}</p>
            </div>
          </Match>

          <Match when={step() === 'review' && proposal()}>
            {getProposal => (
              <div class="flex min-w-0 flex-col gap-5">
                <Show when={getProposal().warnings.length > 0 || getProposal().unreadableFiles.length > 0}>
                  <div class="rounded-lg bg-amber-500/10 px-3 py-2 text-xs text-amber-700 dark:text-amber-300">
                    <For each={[...getProposal().unreadableFiles.map(name => t('product-scanner.review.unreadable-file', { name })), ...getProposal().warnings]}>
                      {warning => <p>{warning}</p>}
                    </For>
                  </div>
                </Show>

                <Show when={newFields().length > 0}>
                  <section>
                    <h3 class="mb-1 text-sm font-semibold">{t('product-scanner.review.new-fields')}</h3>
                    <p class="mb-2 text-xs text-muted-foreground">{t('product-scanner.review.new-fields.description')}</p>
                    <ul class="flex flex-col divide-y rounded-xl border">
                      <For each={newFields()}>
                        {field => (
                          <li class="flex flex-wrap items-center gap-x-3 gap-y-2 px-3 py-2.5">
                            <div class="min-w-0 flex-1">
                              <p class="truncate text-sm font-medium">{field.name}</p>
                              <p class="text-xs text-muted-foreground">{typeLabel(field)}</p>
                            </div>
                            <SimpleSelect
                              class="w-full sm:w-56"
                              options={getTargetOptions(field)}
                              value={fieldTargets()[field.ref] ?? CREATE_FIELD_VALUE}
                              onChange={value => setFieldTargets(({ [field.ref]: _previous, ...rest }) => (value === CREATE_FIELD_VALUE ? rest : { ...rest, [field.ref]: value }))}
                              aria-label={field.name}
                            />
                          </li>
                        )}
                      </For>
                    </ul>
                  </section>
                </Show>

                <section>
                  <div class="mb-2 flex items-center justify-between gap-3">
                    <h3 class="text-sm font-semibold">{t('product-scanner.review.products', { count: getProposal().products.length })}</h3>
                    <button
                      type="button"
                      class="text-xs text-muted-foreground hover:text-foreground"
                      onClick={() => setSelected(selected().size === getProposal().products.length ? new Set<number>() : new Set(getProposal().products.map((_, index) => index)))}
                    >
                      {selected().size === getProposal().products.length ? t('product-scanner.review.select-none') : t('product-scanner.review.select-all')}
                    </button>
                  </div>

                  <ul class="flex flex-col divide-y rounded-xl border">
                    <For each={getProposal().products}>
                      {(product, index) => (
                        <li class={cn('flex gap-3 px-3 py-2.5', !selected().has(index()) && 'opacity-50')}>
                          <SimpleCheckbox class="mt-0.5" checked={selected().has(index())} onChange={checked => toggleProduct(index(), checked)} aria-label={product.name} />
                          <div class="min-w-0 flex-1">
                            <div class="flex items-baseline gap-2">
                              <p class="min-w-0 flex-1 truncate text-sm font-medium">{product.name}</p>
                              <Show when={product.matchesProductId}>
                                <span class="shrink-0 rounded-full bg-muted px-1.5 py-px text-[10px] font-medium text-muted-foreground">{t('product-scanner.review.update')}</span>
                              </Show>
                              <span class="shrink-0 text-sm tabular-nums">
                                {money(product.unitPriceMinor, product.currency)}
                                <span class="text-xs text-muted-foreground">{` / ${product.unit}`}</span>
                              </span>
                            </div>
                            <Show when={product.description}>
                              <p class="truncate text-xs text-muted-foreground">{product.description}</p>
                            </Show>
                            <Show when={Object.keys(product.values).length > 0}>
                              <div class="mt-1.5 flex flex-wrap gap-1">
                                <For each={Object.entries(product.values)}>
                                  {([ref, value]) => (
                                    <Show when={fieldsByRef().get(ref)}>
                                      {getField => (
                                        <span class={cn('rounded-md px-1.5 py-0.5 text-[11px]', getField().status === 'new' ? 'bg-primary/10 text-primary' : 'bg-muted text-muted-foreground')}>
                                          {`${getField().name}: ${formatScanFieldValue({ field: getField(), value, labels: { yes: t('product-scanner.review.yes'), no: t('product-scanner.review.no') } })}`}
                                        </span>
                                      )}
                                    </Show>
                                  )}
                                </For>
                              </div>
                            </Show>
                          </div>
                        </li>
                      )}
                    </For>
                  </ul>
                </section>

                <div class="sticky bottom-0 -mx-1 flex gap-2 bg-background px-1 pt-1 md:static md:justify-end md:bg-transparent">
                  <Button variant="outline" class="flex-1 md:flex-none" onClick={reset} disabled={isSaving()}>{t('product-scanner.review.back')}</Button>
                  <Button variant="primary" class="flex-1 md:flex-none" onClick={save} isLoading={isSaving()} disabled={selected().size === 0}>
                    {t('product-scanner.review.save', { count: selected().size })}
                  </Button>
                </div>
              </div>
            )}
          </Match>
        </Switch>
      </ResponsiveDialog>
    </>
  );
}
