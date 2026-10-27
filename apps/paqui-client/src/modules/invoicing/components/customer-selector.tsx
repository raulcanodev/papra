import type { Contact } from '@/modules/contacts/contacts.types';
import { createEffect, createMemo, createSignal, createUniqueId, For, Show } from 'solid-js';
import { useI18n } from '@/modules/i18n/i18n.provider';
import { cn } from '@/modules/shared/style/cn';
import { TextField } from '@/modules/ui/components/textfield';

const PAGE_SIZE = 24;

export function customerSummary(customer: Contact) {
  return [customer.addressLine1, [customer.postalCode, customer.city].filter(Boolean).join(' '), customer.country].filter(Boolean).join(', ');
}

// Same combobox as the product selector: the list only shows while the field is open, not as a block of recents under it.
export function CustomerSelector(props: {
  customers: readonly Contact[];
  onSelect: (customer: Contact) => void;
  onCreate: (name: string) => void;
}) {
  const { t } = useI18n();
  const listboxId = createUniqueId();
  const [query, setQuery] = createSignal('');
  const [open, setOpen] = createSignal(false);
  const [visibleCount, setVisibleCount] = createSignal(PAGE_SIZE);
  const [activeIndex, setActiveIndex] = createSignal(0);
  let inputRef!: HTMLInputElement;

  const search = () => query().trim();
  const matches = createMemo(() => {
    const term = search().toLowerCase();
    return term
      ? props.customers.filter(customer => `${customer.name} ${customer.email ?? ''} ${customer.taxId ?? ''}`.toLowerCase().includes(term))
      : [...props.customers].sort((left, right) => right.updatedAt.getTime() - left.updatedAt.getTime());
  });
  const visibleCustomers = createMemo(() => matches().slice(0, visibleCount()));

  createEffect(() => {
    search();
    setVisibleCount(PAGE_SIZE);
    setActiveIndex(0);
  });

  const selectCustomer = (customer: Contact) => {
    props.onSelect(customer);
    setQuery('');
    setOpen(false);
  };

  const createCustomer = () => {
    props.onCreate(search());
    setOpen(false);
  };

  const handleKeyDown = (event: KeyboardEvent) => {
    if (event.key === 'ArrowDown') {
      event.preventDefault();
      setOpen(true);
      setActiveIndex(index => Math.min(index + 1, Math.max(visibleCustomers().length - 1, 0)));
    } else if (event.key === 'ArrowUp') {
      event.preventDefault();
      setActiveIndex(index => Math.max(index - 1, 0));
    } else if (event.key === 'Enter' && open() && visibleCustomers()[activeIndex()]) {
      event.preventDefault();
      selectCustomer(visibleCustomers()[activeIndex()]!);
    } else if (event.key === 'Escape') {
      event.preventDefault();
      setOpen(false);
    }
  };

  return (
    <div
      class="relative"
      onFocusOut={(event) => {
        if (!event.currentTarget.contains(event.relatedTarget as Node | null)) {
          setOpen(false);
        }
      }}
    >
      <div class="relative">
        <div class="i-tabler-search pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
        <TextField
          ref={inputRef}
          class="h-10 pl-9 pr-9"
          role="combobox"
          aria-autocomplete="list"
          aria-expanded={open()}
          aria-controls={listboxId}
          aria-activedescendant={open() && visibleCustomers()[activeIndex()] ? `${listboxId}-${visibleCustomers()[activeIndex()]!.id}` : undefined}
          autocomplete="off"
          placeholder={t('invoicing.editor.customer.search')}
          value={query()}
          onFocus={() => setOpen(true)}
          onClick={() => setOpen(true)}
          onInput={(event) => {
            setQuery(event.currentTarget.value);
            setOpen(true);
          }}
          onKeyDown={handleKeyDown}
        />
        <button
          type="button"
          tabindex={-1}
          class="absolute right-1 top-1 grid size-8 place-items-center rounded-md text-muted-foreground hover:bg-muted hover:text-foreground"
          aria-label={t('invoicing.editor.customer.open')}
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

      <Show when={open()}>
        <div class="absolute z-40 mt-1 w-full min-w-72 overflow-hidden rounded-lg border bg-popover text-popover-foreground shadow-lg shadow-black/5 dark:shadow-black/40">
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
            <Show when={visibleCustomers().length > 0} fallback={<div class="px-3 py-6 text-center text-sm text-muted-foreground">{t('invoicing.editor.customer.empty')}</div>}>
              <For each={visibleCustomers()}>
                {(customer, index) => (
                  <button
                    id={`${listboxId}-${customer.id}`}
                    type="button"
                    role="option"
                    aria-selected={activeIndex() === index()}
                    class={cn(
                      'flex w-full items-center gap-3 rounded-md px-2.5 py-2 text-left outline-none transition-colors hover:bg-accent focus-visible:bg-accent',
                      activeIndex() === index() && 'bg-accent/70',
                    )}
                    onMouseEnter={() => setActiveIndex(index())}
                    onMouseDown={event => event.preventDefault()}
                    onClick={() => selectCustomer(customer)}
                  >
                    <span class="grid size-8 shrink-0 place-items-center rounded-full bg-muted text-xs font-medium text-muted-foreground">
                      {customer.name.trim().charAt(0).toUpperCase()}
                    </span>
                    <span class="min-w-0 flex-1">
                      <span class="block truncate text-sm font-medium">{customer.name}</span>
                      <span class="block truncate text-xs text-muted-foreground">
                        {[customer.email, customer.city].filter(Boolean).join(' · ')}
                      </span>
                    </span>
                  </button>
                )}
              </For>
            </Show>
          </div>

          <div class="border-t p-1">
            <button type="button" class="flex w-full items-center gap-2 rounded-md px-2.5 py-2 text-left text-sm font-medium text-primary hover:bg-primary/8" onMouseDown={event => event.preventDefault()} onClick={createCustomer}>
              <div class="i-tabler-user-plus size-4" />
              <span class="min-w-0 truncate">{search() ? t('invoicing.editor.customer.add-named', { name: search() }) : t('invoicing.editor.customer.add')}</span>
            </button>
          </div>
        </div>
      </Show>
    </div>
  );
}
