import type { InvoicingProduct } from '../invoicing.types';
import { createEffect, createMemo, createSignal, createUniqueId, For, Show } from 'solid-js';
import { getDocumentLocale } from '@/modules/i18n/document-locale';
import { useI18n } from '@/modules/i18n/i18n.provider';
import { cn } from '@/modules/shared/style/cn';
import { TextField } from '@/modules/ui/components/textfield';
import { createProductSearchIndex, normalizeProductSearch, rankProductSearchIndex } from './product-selector.models';

const PAGE_SIZE = 24;

function formatProductPrice(product: InvoicingProduct) {
  try {
    return new Intl.NumberFormat(getDocumentLocale(), { style: 'currency', currency: product.currency }).format(product.unitPriceMinor / 100);
  } catch {
    return `${(product.unitPriceMinor / 100).toFixed(2)} ${product.currency}`;
  }
}

export function ProductSelector(props: {
  products: readonly InvoicingProduct[];
  value: string;
  selectedProductId?: string | null;
  onChange: (value: string, product: InvoicingProduct | null) => void;
  onCreate?: (name: string) => Promise<InvoicingProduct>;
  placeholder?: string;
  ariaLabel?: string;
  disabled?: boolean;
  class?: string;
}) {
  const { t } = useI18n();
  const listboxId = createUniqueId();
  const [open, setOpen] = createSignal(false);
  const [visibleCount, setVisibleCount] = createSignal(PAGE_SIZE);
  const [activeIndex, setActiveIndex] = createSignal(0);
  const [creating, setCreating] = createSignal(false);
  let inputRef!: HTMLInputElement;

  const query = () => props.value.trim();
  // Product text is normalized once per catalog update, not again on every keystroke.
  const searchIndex = createMemo(() => createProductSearchIndex(props.products));
  const exactNames = createMemo(() => new Set(searchIndex().map(({ name }) => name)));
  const matches = createMemo(() => rankProductSearchIndex(searchIndex(), query()));
  const visibleProducts = createMemo(() => matches().slice(0, visibleCount()));
  const canCreate = () => Boolean(props.onCreate && query() && !exactNames().has(normalizeProductSearch(query())));

  createEffect(() => {
    query();
    setVisibleCount(PAGE_SIZE);
    setActiveIndex(0);
  });

  const selectProduct = (product: InvoicingProduct) => {
    props.onChange(product.name, product);
    setOpen(false);
  };

  const keepFreeText = () => {
    props.onChange(props.value, null);
    setOpen(false);
  };

  const createProduct = async () => {
    if (!props.onCreate || !canCreate() || creating()) {
      return;
    }
    setCreating(true);
    try {
      const product = await props.onCreate(query());
      selectProduct(product);
    } catch {
      setOpen(true);
    } finally {
      setCreating(false);
    }
  };

  const handleKeyDown = (event: KeyboardEvent) => {
    if (event.key === 'ArrowDown') {
      event.preventDefault();
      setOpen(true);
      setActiveIndex(index => Math.min(index + 1, Math.max(visibleProducts().length - 1, 0)));
    } else if (event.key === 'ArrowUp') {
      event.preventDefault();
      setActiveIndex(index => Math.max(index - 1, 0));
    } else if (event.key === 'Enter' && open() && visibleProducts()[activeIndex()]) {
      event.preventDefault();
      selectProduct(visibleProducts()[activeIndex()]!);
    } else if (event.key === 'Escape') {
      event.preventDefault();
      setOpen(false);
    }
  };

  return (
    <div
      class={cn('relative', props.class)}
      onFocusOut={(event) => {
        if (!event.currentTarget.contains(event.relatedTarget as Node | null)) {
          setOpen(false);
        }
      }}
    >
      <div class="relative">
        <TextField
          ref={inputRef}
          class="h-10 pr-9"
          role="combobox"
          aria-autocomplete="list"
          aria-expanded={open()}
          aria-controls={listboxId}
          aria-activedescendant={open() && visibleProducts()[activeIndex()] ? `${listboxId}-${visibleProducts()[activeIndex()]!.id}` : undefined}
          autocomplete="off"
          aria-label={props.ariaLabel}
          placeholder={props.placeholder}
          disabled={props.disabled}
          value={props.value}
          onFocus={() => setOpen(true)}
          onClick={() => setOpen(true)}
          onInput={(event) => {
            setVisibleCount(PAGE_SIZE);
            setActiveIndex(0);
            props.onChange(event.currentTarget.value, null);
            setOpen(true);
          }}
          onKeyDown={handleKeyDown}
        />
        <button
          type="button"
          tabindex={-1}
          class="absolute right-1 top-1 grid size-8 place-items-center rounded-md text-muted-foreground hover:bg-muted hover:text-foreground disabled:pointer-events-none"
          aria-label={t('invoicing.product-selector.open')}
          disabled={props.disabled}
          onClick={() => {
            const next = !open();
            setOpen(next);
            if (next) {
              queueMicrotask(() => inputRef.focus());
            }
          }}
        >
          <div class={cn('i-tabler-chevron-down size-4 transition-transform', open() && 'rotate-180')} />
        </button>
      </div>

      <Show when={open() && !props.disabled}>
        <div class="absolute z-40 mt-1 w-full min-w-72 overflow-hidden rounded-lg border bg-popover text-popover-foreground shadow-lg shadow-black/5 dark:shadow-black/40">
          <div class="flex items-center justify-between border-b px-3 py-2 text-xs text-muted-foreground">
            <span>{query() ? t('invoicing.product-selector.results') : t('invoicing.product-selector.all')}</span>
            <span>{matches().length}</span>
          </div>
          <div
            id={listboxId}
            role="listbox"
            class="max-h-64 overflow-y-auto overscroll-contain p-1"
            onScroll={(event) => {
              const target = event.currentTarget;
              if (target.scrollTop + target.clientHeight >= target.scrollHeight - 40) {
                setVisibleCount(count => Math.min(count + PAGE_SIZE, matches().length));
              }
            }}
          >
            <Show when={visibleProducts().length > 0} fallback={<div class="px-3 py-6 text-center text-sm text-muted-foreground">{t('invoicing.product-selector.empty')}</div>}>
              <For each={visibleProducts()}>
                {(product, index) => (
                  <button
                    id={`${listboxId}-${product.id}`}
                    type="button"
                    role="option"
                    aria-selected={props.selectedProductId === product.id}
                    class={cn(
                      'flex w-full items-center gap-3 rounded-md px-2.5 py-2 text-left outline-none transition-colors hover:bg-accent focus-visible:bg-accent',
                      activeIndex() === index() && 'bg-accent/70',
                    )}
                    onMouseEnter={() => setActiveIndex(index())}
                    onMouseDown={event => event.preventDefault()}
                    onClick={() => selectProduct(product)}
                  >
                    <span class="grid size-8 shrink-0 place-items-center rounded-md bg-muted text-muted-foreground">
                      <div class={cn(product.icon ?? 'i-tabler-package', 'size-4')} />
                    </span>
                    <span class="min-w-0 flex-1">
                      <span class="block truncate text-sm font-medium">{product.name}</span>
                      <span class="block truncate text-xs text-muted-foreground">
                        {[product.description, product.contactName, `${formatProductPrice(product)} / ${product.unit}`].filter(Boolean).join(' · ')}
                      </span>
                    </span>
                    <Show when={props.selectedProductId === product.id}><div class="i-tabler-check size-4 shrink-0 text-primary" /></Show>
                  </button>
                )}
              </For>
              <Show when={visibleCount() < matches().length}>
                <div class="px-3 py-2 text-center text-xs text-muted-foreground">{t('invoicing.product-selector.more')}</div>
              </Show>
            </Show>
          </div>

          <Show when={query() !== ''}>
            <div class="border-t p-1">
              <button type="button" class="flex w-full items-center gap-2 rounded-md px-2.5 py-2 text-left text-sm hover:bg-accent" onMouseDown={event => event.preventDefault()} onClick={keepFreeText}>
                <div class="i-tabler-pencil size-4 text-muted-foreground" />
                <span class="min-w-0 truncate">{t('invoicing.product-selector.use-text', { name: query() })}</span>
              </button>
              <Show when={canCreate()}>
                <button type="button" class="flex w-full items-center gap-2 rounded-md px-2.5 py-2 text-left text-sm font-medium text-primary hover:bg-primary/8 disabled:opacity-50" disabled={creating()} onMouseDown={event => event.preventDefault()} onClick={createProduct}>
                  <div class={cn(creating() ? 'i-tabler-loader-2 animate-spin' : 'i-tabler-package-plus', 'size-4')} />
                  <span class="min-w-0 truncate">{t('invoicing.product-selector.create', { name: query() })}</span>
                </button>
              </Show>
            </div>
          </Show>
        </div>
      </Show>
    </div>
  );
}
