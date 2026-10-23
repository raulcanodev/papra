import type { ConceptTreatment, ImportDecisions, ImportPriceListChoice } from './pricing-import.models';
import type { ImportIssue, PricingImportBlock, PricingImportProposal } from './pricing-import.types';
import type { TranslationKeys } from '@/modules/i18n/locales.types';
import { useNavigate } from '@solidjs/router';
import { useQuery } from '@tanstack/solid-query';
import { createMemo, createSignal, For, Match, Show, Switch } from 'solid-js';
import { usePageFilesDrop } from '@/modules/documents/components/global-drop-area.component';
import { useI18n } from '@/modules/i18n/i18n.provider';
import { getProductsQueryKey } from '@/modules/invoicing/components/product-form';
import { fetchProducts } from '@/modules/invoicing/invoicing.services';
import { queryClient } from '@/modules/shared/query/query-client';
import { cn } from '@/modules/shared/style/cn';
import { get } from '@/modules/shared/utils/get';
import { Button } from '@/modules/ui/components/button';
import { ResponsiveDialog } from '@/modules/ui/components/responsive-dialog';
import { SimpleCheckbox } from '@/modules/ui/components/simple-checkbox';
import { SimpleSelect } from '@/modules/ui/components/simple-select';
import { createToast } from '@/modules/ui/components/sonner';
import { TextField } from '@/modules/ui/components/textfield';
import { getOrganizationPriceListHref } from '@/modules/ui/navigation/organization-navigation';
import { formatMoney } from '../pricing.models';
import { getPricingQueryKey } from '../pricing.services';
import { buildImportInput, CREATE_PRODUCT, getConceptKey, getDefaultDecisions, getDefaultPriceListName, getImportedProducts, getProductPreview, IMPORT_FILE_ACCEPT, SKIP_PRODUCT } from './pricing-import.models';
import { analyzePricingImport, confirmPricingImport } from './pricing-import.services';

type Step = 'pick' | 'reading' | 'review';

const NO_PRICE_LIST = '__none__';
const NEW_PRICE_LIST = '';

const money = (minor: number | null) => (minor === null ? '—' : formatMoney(minor));

// A spreadsheet of cost breakdowns and prices (several blocks of products in a sheet): the AI finds the blocks, the
// app reads the figures and checks them, and the user reviews everything before anything is saved
export function PricingImportDialog(props: { organizationId: string; open: boolean; onOpenChange: (open: boolean) => void }) {
  const { t } = useI18n();
  const navigate = useNavigate();
  const [step, setStep] = createSignal<Step>('pick');
  const [proposal, setProposal] = createSignal<PricingImportProposal | null>(null);
  const [decisions, setDecisions] = createSignal<ImportDecisions>({ includedBlockIds: new Set(), treatments: {}, productTargets: {} });
  const [priceList, setPriceList] = createSignal<ImportPriceListChoice>({ mode: 'new', name: '' });
  const [isSaving, setIsSaving] = createSignal(false);
  let fileInput: HTMLInputElement | undefined;

  const productsQuery = useQuery(() => ({
    queryKey: getProductsQueryKey({ organizationId: props.organizationId }),
    queryFn: () => fetchProducts({ organizationId: props.organizationId }),
    enabled: props.open && step() === 'review',
  }));
  const catalog = () => (productsQuery.data?.products ?? []).filter(product => !product.contactId && !product.archivedAt);

  const reset = () => {
    setStep('pick');
    setProposal(null);
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

  const read = async (file: File | undefined) => {
    if (!file) {
      return;
    }
    setStep('reading');

    try {
      const result = await analyzePricingImport({ organizationId: props.organizationId, file });

      if (result.blocks.length === 0) {
        createToast({ type: 'error', message: t('pricing.import.toast.no-blocks') });
        setStep('pick');
        return;
      }

      setProposal(result);
      setDecisions(getDefaultDecisions({ proposal: result }));
      setPriceList({ mode: 'new', name: getDefaultPriceListName({ fileName: result.fileName }) });
      setStep('review');
    } catch (error) {
      const code = get(error, ['data', 'error', 'code']);
      createToast({ type: 'error', message: t(code === 'pricing.import_unreadable' ? 'pricing.import.toast.unreadable' : 'pricing.import.toast.read-error') });
      setStep('pick');
    }
  };

  // A spreadsheet dropped anywhere on the page is imported here, not stored as a plain document: the dialog opens on
  // its reading and then its review, so nothing is saved before the mapping is checked
  usePageFilesDrop((files) => {
    if (step() === 'reading' || isSaving()) {
      return;
    }
    props.onOpenChange(true);
    void read(files[0]);
  }, { description: () => t('pricing.import.drop-area') });

  const imported = createMemo(() => {
    const current = proposal();
    return current ? getImportedProducts({ proposal: current, decisions: decisions() }) : [];
  });
  const createCount = () => imported().filter(({ target }) => target === CREATE_PRODUCT).length;
  const updateCount = () => imported().length - createCount();
  const isPriceListValid = () => priceList().mode !== 'new' || (priceList() as { name: string }).name.trim() !== '';

  const setTreatment = (key: string, treatment: ConceptTreatment) => setDecisions(current => ({ ...current, treatments: { ...current.treatments, [key]: treatment } }));
  const setTarget = (key: string, target: string) => setDecisions(current => ({ ...current, productTargets: { ...current.productTargets, [key]: target } }));
  const toggleBlock = (blockId: string, checked: boolean) => setDecisions((current) => {
    const included = new Set(current.includedBlockIds);
    if (checked) {
      included.add(blockId);
    } else {
      included.delete(blockId);
    }
    return { ...current, includedBlockIds: included };
  });

  const save = async () => {
    const current = proposal();
    if (!current || imported().length === 0 || !isPriceListValid()) {
      return;
    }
    setIsSaving(true);

    try {
      const result = await confirmPricingImport({ organizationId: props.organizationId, input: buildImportInput({ proposal: current, decisions: decisions(), priceList: priceList() }) });
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: getPricingQueryKey({ organizationId: props.organizationId }) }),
        queryClient.invalidateQueries({ queryKey: getProductsQueryKey({ organizationId: props.organizationId }) }),
      ]);
      createToast({ type: 'success', message: t('pricing.import.toast.imported', { created: result.createdProductsCount, updated: result.updatedProductsCount }) });
      setIsSaving(false);
      onOpenChange(false);
      if (result.priceListId !== null) {
        navigate(getOrganizationPriceListHref({ organizationId: props.organizationId, priceListId: result.priceListId }));
      }
    } catch {
      createToast({ type: 'error', message: t('pricing.import.toast.import-error') });
      setIsSaving(false);
    }
  };

  const priceListOptions = () => [
    { value: NEW_PRICE_LIST, label: t('pricing.import.price-list.new') },
    ...(proposal()?.priceLists ?? []).map(list => ({ value: list.id, label: t('pricing.import.price-list.existing', { name: list.name }) })),
    { value: NO_PRICE_LIST, label: t('pricing.import.price-list.none') },
  ];
  const priceListValue = () => {
    const choice = priceList();
    return choice.mode === 'new' ? NEW_PRICE_LIST : choice.mode === 'existing' ? choice.priceListId : NO_PRICE_LIST;
  };

  const warningMessages = () => (proposal()?.warnings ?? []).map(warning => t(`pricing.import.warning.${warning}` as TranslationKeys));

  return (
    <>
      <input
        ref={fileInput}
        type="file"
        class="hidden"
        accept={IMPORT_FILE_ACCEPT}
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
        title={t('pricing.import.title')}
        description={step() === 'review' ? t('pricing.import.review.description', { name: proposal()?.fileName ?? '' }) : t('pricing.import.description')}
      >
        <Switch>
          <Match when={step() === 'pick'}>
            <button
              type="button"
              class="flex w-full flex-col items-center justify-center gap-2 rounded-xl border-2 border-dashed px-6 py-10 text-center text-muted-foreground transition-colors hover:border-primary/50"
              onClick={() => fileInput?.click()}
            >
              <div class="i-tabler-table-import size-8" />
              <span class="text-sm font-medium text-foreground">{t('pricing.import.pick.drop')}</span>
              <span class="text-xs">{t('pricing.import.pick.formats')}</span>
            </button>
          </Match>

          <Match when={step() === 'reading'}>
            <div class="flex flex-col items-center gap-3 py-12 text-center">
              <div class="i-tabler-loader-2 size-7 animate-spin text-muted-foreground" />
              <p class="text-sm font-medium">{t('pricing.import.reading.title')}</p>
              <p class="text-xs text-muted-foreground">{t('pricing.import.reading.description')}</p>
            </div>
          </Match>

          <Match when={step() === 'review' && proposal()}>
            {getProposal => (
              <div class="flex min-w-0 flex-col gap-5">
                <Show when={warningMessages().length > 0}>
                  <div class="rounded-lg bg-amber-500/10 px-3 py-2 text-xs text-amber-700 dark:text-amber-300">
                    <For each={warningMessages()}>{warning => <p>{warning}</p>}</For>
                  </div>
                </Show>

                <section class="flex flex-col gap-2 sm:flex-row sm:items-end">
                  <div class="min-w-0 flex-1">
                    <h3 class="mb-1 text-sm font-semibold">{t('pricing.import.price-list.title')}</h3>
                    <SimpleSelect
                      options={priceListOptions()}
                      value={priceListValue()}
                      aria-label={t('pricing.import.price-list.title')}
                      onChange={value => setPriceList(value === NEW_PRICE_LIST ? { mode: 'new', name: getDefaultPriceListName({ fileName: getProposal().fileName }) } : value === NO_PRICE_LIST ? { mode: 'none' } : { mode: 'existing', priceListId: value })}
                    />
                  </div>
                  <Show when={priceList().mode === 'new'}>
                    <div class="min-w-0 flex-1">
                      <TextField aria-label={t('invoicing.common.name')} placeholder={t('pricing.lists.name-placeholder')} value={(priceList() as { name: string }).name} onInput={event => setPriceList({ mode: 'new', name: event.currentTarget.value })} />
                    </div>
                  </Show>
                </section>
                <p class="-mt-3 text-xs text-muted-foreground">{t(priceList().mode === 'existing' ? 'pricing.import.price-list.existing-hint' : 'pricing.import.price-list.hint')}</p>

                <For each={getProposal().blocks}>
                  {(block, blockIndex) => (
                    <ImportBlockCard
                      block={block}
                      index={blockIndex()}
                      decisions={decisions()}
                      catalog={catalog()}
                      onToggle={checked => toggleBlock(block.id, checked)}
                      onTreatmentChange={setTreatment}
                      onTargetChange={setTarget}
                    />
                  )}
                </For>

                <div class="sticky bottom-0 z-10 -mx-1 flex flex-col gap-2 bg-card px-1 pt-2 md:flex-row md:items-center">
                  <p class="flex-1 text-xs text-muted-foreground">{t('pricing.import.summary', { created: createCount(), updated: updateCount() })}</p>
                  <div class="flex gap-2">
                    <Button variant="outline" class="flex-1 md:flex-none" onClick={reset} disabled={isSaving()}>{t('pricing.import.back')}</Button>
                    <Button variant="primary" class="flex-1 md:flex-none" onClick={save} isLoading={isSaving()} disabled={imported().length === 0 || !isPriceListValid()}>
                      {t('pricing.import.confirm', { count: imported().length })}
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

function ImportBlockCard(props: {
  block: PricingImportBlock;
  index: number;
  decisions: ImportDecisions;
  catalog: Array<{ id: string; name: string }>;
  onToggle: (checked: boolean) => void;
  onTreatmentChange: (key: string, treatment: ConceptTreatment) => void;
  onTargetChange: (key: string, target: string) => void;
}) {
  const { t } = useI18n();
  const isIncluded = () => props.decisions.includedBlockIds.has(props.block.id);
  const previews = createMemo(() => props.block.products.map(product => getProductPreview({ block: props.block, product, treatments: props.decisions.treatments })));
  const issueFor = (productKey: string, code: ImportIssue['code']) => props.block.issues.find(issue => issue.productKey === productKey && issue.code === code);
  const blockIssues = () => props.block.issues.filter(issue => issue.productKey === null);

  const treatmentOptions = () => [
    { value: 'cost', label: t('pricing.import.treatment.cost') },
    { value: 'shipping', label: t('pricing.import.treatment.shipping') },
    { value: 'skip', label: t('pricing.import.treatment.skip') },
  ];

  const targetOptions = (product: PricingImportBlock['products'][number]) => [
    { value: CREATE_PRODUCT, label: t('pricing.import.target.create') },
    { value: SKIP_PRODUCT, label: t('pricing.import.target.skip') },
    ...props.catalog
      .toSorted((a, b) => Number(b.id === product.matchedProduct?.id) - Number(a.id === product.matchedProduct?.id) || a.name.localeCompare(b.name))
      .map(catalogProduct => ({ value: catalogProduct.id, label: t('pricing.import.target.update', { name: catalogProduct.name }) })),
    // Until the catalog is loaded, the match the server found is still offered
    ...(product.matchedProduct && !props.catalog.some(catalogProduct => catalogProduct.id === product.matchedProduct!.id) ? [{ value: product.matchedProduct.id, label: t('pricing.import.target.update', { name: product.matchedProduct.name }) }] : []),
  ];

  return (
    <section class={cn('rounded-xl border bg-card', !props.block.isBalanced && 'border-amber-500/50')}>
      <header class="flex flex-wrap items-center gap-x-3 gap-y-1 border-b px-3 py-2.5">
        <SimpleCheckbox checked={isIncluded()} onChange={props.onToggle} aria-label={t('pricing.import.block.include')} />
        <div class="min-w-0 flex-1">
          <p class="truncate text-sm font-semibold">{props.block.title ?? t('pricing.import.block.title', { index: props.index + 1 })}</p>
          <p class="text-xs text-muted-foreground">{t('pricing.import.block.location', { sheet: props.block.sheetName, row: props.block.headerRow, count: props.block.products.length })}</p>
        </div>
        <span class={cn('shrink-0 rounded-full px-2 py-0.5 text-[11px] font-medium', props.block.isBalanced ? 'bg-emerald-500/10 text-emerald-700 dark:text-emerald-300' : 'bg-amber-500/15 text-amber-700 dark:text-amber-300')}>
          {props.block.isBalanced ? t('pricing.import.block.balanced') : t('pricing.import.block.unbalanced')}
        </span>
      </header>

      <Show when={!props.block.isBalanced || blockIssues().length > 0}>
        <div class="border-b bg-amber-500/5 px-3 py-2 text-xs text-amber-700 dark:text-amber-300">
          <Show when={!props.block.isBalanced}><p>{t('pricing.import.block.unbalanced-hint')}</p></Show>
          <For each={blockIssues()}>{issue => <p>{t(`pricing.import.issue.${issue.code}` as TranslationKeys)}</p>}</For>
        </div>
      </Show>

      <div class={cn('overflow-x-auto', !isIncluded() && 'opacity-50')}>
        <table class="w-full min-w-max text-sm">
          <thead>
            <tr class="border-b align-top">
              <th class="sticky left-0 z-1 bg-card px-3 py-2 text-left text-xs font-medium text-muted-foreground">{t('pricing.import.column.concept')}</th>
              <For each={props.block.products}>
                {product => (
                  <th class="min-w-40 px-3 py-2 text-right font-normal">
                    <p class="truncate font-medium">{product.name}</p>
                    <SimpleSelect class="mt-1" triggerClass="h-7 text-xs" options={targetOptions(product)} value={props.decisions.productTargets[product.key] ?? CREATE_PRODUCT} onChange={value => props.onTargetChange(product.key, value)} aria-label={product.name} disabled={!isIncluded()} />
                  </th>
                )}
              </For>
            </tr>
          </thead>
          <tbody>
            <For each={props.block.concepts}>
              {(concept, conceptIndex) => {
                const key = () => getConceptKey({ blockId: props.block.id, index: conceptIndex() });
                const treatment = () => props.decisions.treatments[key()] ?? 'cost';
                return (
                  <tr class="border-b last:border-b-0">
                    <td class="sticky left-0 z-1 bg-card px-3 py-1.5">
                      <div class="flex items-center gap-2">
                        <span class="min-w-24 truncate">{concept.name}</span>
                        <SimpleSelect class="w-36" triggerClass="h-7 text-xs" options={treatmentOptions()} value={treatment()} onChange={value => props.onTreatmentChange(key(), value as ConceptTreatment)} aria-label={concept.name} disabled={!isIncluded()} />
                        <Show when={concept.kind === 'commission'}>
                          <span class="shrink-0 rounded-full bg-amber-500/15 px-1.5 py-px text-[10px] font-medium text-amber-700 dark:text-amber-300" title={t('pricing.import.concept.commission-hint')}>{t('pricing.import.concept.review')}</span>
                        </Show>
                      </div>
                    </td>
                    <For each={props.block.products}>
                      {product => (
                        <td class={cn('px-3 py-1.5 text-right tabular-nums', treatment() === 'skip' && 'text-muted-foreground line-through', (product.amounts[conceptIndex()] ?? 0) < 0 && 'text-destructive')}>
                          {money(product.amounts[conceptIndex()] ?? 0)}
                        </td>
                      )}
                    </For>
                  </tr>
                );
              }}
            </For>
          </tbody>
          <tfoot class="border-t text-xs">
            <SummaryRow label={t('pricing.import.row.breakdown')} values={previews().map(preview => money(preview.costMinor))} strong />
            <SummaryRow
              label={t('pricing.import.row.file-cost')}
              values={props.block.products.map(product => money(product.costMinor))}
              highlight={props.block.products.map(product => issueFor(product.key, 'cost_mismatch') !== undefined)}
              titles={props.block.products.map((product) => {
                const issue = issueFor(product.key, 'cost_mismatch');
                return issue ? t('pricing.import.issue.cost_mismatch', { expected: money(issue.expectedMinor), actual: money(issue.actualMinor) }) : undefined;
              })}
            />
            <SummaryRow label={t('pricing.import.row.shipping')} values={previews().map(preview => (preview.shipping ? money(preview.shipping.amountMinor) : '—'))} />
            <SummaryRow label={t('pricing.import.row.price')} values={previews().map(preview => money(preview.priceMinor))} strong />
            <SummaryRow
              label={t('pricing.import.row.margin')}
              values={previews().map(preview => money(preview.marginMinor))}
              highlight={previews().map(preview => preview.marginMinor !== null && preview.marginMinor < 0)}
            />
          </tfoot>
        </table>
      </div>
    </section>
  );
}

function SummaryRow(props: { label: string; values: string[]; strong?: boolean; highlight?: boolean[]; titles?: Array<string | undefined> }) {
  return (
    <tr>
      <td class="sticky left-0 z-1 bg-card px-3 py-1.5 text-muted-foreground">{props.label}</td>
      <For each={props.values}>
        {(value, index) => (
          <td class={cn('px-3 py-1.5 text-right tabular-nums', props.strong && 'font-medium text-foreground', props.highlight?.[index()] && 'font-medium text-amber-700 dark:text-amber-300')} title={props.titles?.[index()]}>
            <Show when={props.highlight?.[index()]}><span class="i-tabler-alert-triangle mr-1 inline-block size-3 align-[-1px]" /></Show>
            {value}
          </td>
        )}
      </For>
    </tr>
  );
}
