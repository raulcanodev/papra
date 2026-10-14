import type { JSX } from 'solid-js';
import type { ActiveFilter, DateRangePreset, DateRangeValue, FilterField, FilterValue } from './table-filters';
import { createMemo, createSignal, For, Show } from 'solid-js';
import { useI18n } from '@/modules/i18n/i18n.provider';
import { cn } from '@/modules/shared/style/cn';
import { Button } from './button';
import { Popover, PopoverContent, PopoverTrigger } from './popover';
import { clearRemovableFilters, formatDateRange, getActiveFilter, isDateRangeValue, resolveDatePreset, setActiveFilterValue } from './table-filters';
import { TextField } from './textfield';

const defaultDatePresets: DateRangePreset[] = ['today', 'this_week', 'this_month', 'last_month', 'last_30'];

function FilterOptionList(props: {
  field: Extract<FilterField, { type: 'select' | 'multi-select' }>;
  value: FilterValue | undefined;
  onChange: (value: FilterValue | undefined) => void;
}) {
  const { t } = useI18n();
  const [term, setTerm] = createSignal('');
  const selected = () => Array.isArray(props.value) ? props.value : [];
  const visibleOptions = createMemo(() => {
    const needle = term().trim().toLocaleLowerCase();
    if (!needle) {
      return props.field.options;
    }
    return props.field.options.filter(option => `${option.label} ${option.description ?? ''} ${option.keywords ?? ''}`.toLocaleLowerCase().includes(needle));
  });
  const toggle = (value: string) => {
    if (props.field.type === 'select') {
      props.onChange(selected()[0] === value ? undefined : [value]);
      return;
    }
    props.onChange(selected().includes(value) ? selected().filter(item => item !== value) : [...selected(), value]);
  };

  return (
    <div class="flex flex-col gap-1.5">
      <Show when={props.field.searchable || props.field.options.length > 6}>
        <div class="relative">
          <div class="i-tabler-search pointer-events-none absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground" />
          <TextField type="search" value={term()} onInput={event => setTerm(event.currentTarget.value)} placeholder={t('table.filters.search-options')} class="h-8 pl-8" />
        </div>
      </Show>
      <div class="-mx-1 flex max-h-72 flex-col overflow-y-auto px-1">
        <For each={visibleOptions()} fallback={<p class="px-2 py-6 text-center text-sm text-muted-foreground">{t('table.filters.no-results')}</p>}>
          {option => (
            <button type="button" class="flex min-h-9 w-full items-center gap-2.5 rounded-md px-2 py-1.5 text-left text-sm transition-colors hover:bg-accent" onClick={() => toggle(option.value)}>
              <Show when={props.field.type === 'multi-select'}>
                <span class={cn('flex size-4 shrink-0 items-center justify-center rounded-sm border border-primary', selected().includes(option.value) && 'bg-primary text-primary-foreground')}>
                  <Show when={selected().includes(option.value)}><div class="i-tabler-check size-3" /></Show>
                </span>
              </Show>
              {option.icon}
              <span class="min-w-0 flex-1">
                <span class="block truncate">{option.label}</span>
                <Show when={option.description}><span class="block truncate text-xs text-muted-foreground">{option.description}</span></Show>
              </span>
              <Show when={props.field.type === 'select' && selected().includes(option.value)}><div class="i-tabler-check size-4 text-primary" /></Show>
            </button>
          )}
        </For>
      </div>
      <Show when={selected().length > 0}>
        <button type="button" class="border-t px-2 pt-2 text-left text-xs font-medium text-muted-foreground hover:text-foreground" onClick={() => props.onChange(undefined)}>{t('table.filters.clear')}</button>
      </Show>
    </div>
  );
}

function DateRangeEditor(props: { field: Extract<FilterField, { type: 'date-range' }>; value: FilterValue | undefined; onChange: (value: DateRangeValue | undefined) => void }) {
  const { t } = useI18n();
  const range = () => isDateRangeValue(props.value) ? props.value : undefined;
  const presets = () => props.field.presets ?? defaultDatePresets;
  return (
    <div class="flex flex-col gap-1">
      <For each={presets()}>
        {preset => (
          <button type="button" class="flex min-h-9 items-center gap-2 rounded-md px-2 text-left text-sm transition-colors hover:bg-accent" onClick={() => props.onChange(resolveDatePreset(preset))}>
            <span class="flex-1">{t(`table.filters.date.${preset}`)}</span>
            <Show when={range()?.preset === preset}><div class="i-tabler-check size-4 text-primary" /></Show>
          </button>
        )}
      </For>
      <div class="my-1 h-px bg-border" />
      <p class="px-2 text-xs font-medium text-muted-foreground">{t('table.filters.custom-range')}</p>
      <div class="grid grid-cols-2 gap-2 px-2 pb-1">
        <TextField type="date" value={range()?.from ?? ''} onInput={event => props.onChange(event.currentTarget.value && range()?.to ? { from: event.currentTarget.value, to: range()!.to } : undefined)} class="h-8 min-w-0 px-2 text-xs" />
        <TextField type="date" value={range()?.to ?? ''} onInput={event => props.onChange(event.currentTarget.value && range()?.from ? { from: range()!.from, to: event.currentTarget.value } : undefined)} class="h-8 min-w-0 px-2 text-xs" />
      </div>
    </div>
  );
}

function TableFilterMenu(props: { fields: FilterField[]; value: ActiveFilter[]; onChange: (value: ActiveFilter[]) => void }) {
  const { t } = useI18n();
  const [activeFieldId, setActiveFieldId] = createSignal<string>();
  const activeField = () => props.fields.length === 1 ? props.fields[0] : props.fields.find(field => field.id === activeFieldId());
  const removableCount = () => props.value.filter(filter => !props.fields.find(field => field.id === filter.fieldId)?.required).length;
  const update = (fieldId: string, value: FilterValue | undefined) => props.onChange(setActiveFilterValue(props.value, fieldId, value));

  return (
    <Popover onOpenChange={open => !open && setActiveFieldId(undefined)}>
      <PopoverTrigger as={Button} variant="outline" size="sm" class={cn('gap-1.5', removableCount() > 0 && 'border-primary/50')}>
        <div class="i-tabler-adjustments-horizontal size-4" />
        {t('table.filters.button')}
        <Show when={removableCount() > 0}><span class="flex h-5 min-w-5 items-center justify-center rounded-full bg-primary px-1.5 text-[10px] font-semibold text-primary-foreground">{removableCount()}</span></Show>
      </PopoverTrigger>
      <PopoverContent class="w-[min(16rem,calc(100vw-2rem))] p-1.5">
        <Show
          when={activeField()}
          fallback={(
            <div class="flex flex-col gap-1">
              <For each={props.fields}>
                {field => (
                  <button type="button" class="flex min-h-9 items-center gap-2.5 rounded-md px-2 text-left text-sm transition-colors hover:bg-accent" onClick={() => setActiveFieldId(field.id)}>
                    <Show when={field.icon}><div class={`${field.icon} size-4 text-muted-foreground`} /></Show>
                    <span class="flex-1">{field.label}</span>
                    <div class="i-tabler-chevron-right size-4 text-muted-foreground" />
                  </button>
                )}
              </For>
              <Show when={removableCount() > 0}>
                <button type="button" class="mt-1 border-t px-2 pt-2 text-left text-xs font-medium text-muted-foreground hover:text-foreground" onClick={() => props.onChange(clearRemovableFilters(props.value, props.fields))}>{t('table.filters.clear-all')}</button>
              </Show>
            </div>
          )}
        >
          {field => (
            <div class="flex flex-col gap-1.5">
              <Show when={props.fields.length > 1}>
                <button type="button" class="flex items-center gap-1 self-start rounded-md px-1.5 py-1 text-xs font-medium text-muted-foreground hover:bg-accent hover:text-foreground" onClick={() => setActiveFieldId(undefined)}>
                  <div class="i-tabler-chevron-left size-3.5" />
                  {field().label}
                </button>
              </Show>
              <Show
                when={field().type === 'date-range'}
                fallback={(
                  <FilterOptionList field={field() as Extract<FilterField, { type: 'select' | 'multi-select' }>} value={getActiveFilter(props.value, field().id)?.value} onChange={value => update(field().id, value)} />
                )}
              >
                <DateRangeEditor field={field() as Extract<FilterField, { type: 'date-range' }>} value={getActiveFilter(props.value, field().id)?.value} onChange={value => update(field().id, value)} />
              </Show>
            </div>
          )}
        </Show>
      </PopoverContent>
    </Popover>
  );
}

export type TableToolbarProps = {
  search?: string;
  onSearchChange?: (value: string) => void;
  searchPlaceholder?: string;
  searchLoading?: boolean;
  fields?: FilterField[];
  filters?: ActiveFilter[];
  onFiltersChange?: (value: ActiveFilter[]) => void;
  actions?: JSX.Element;
  class?: string;
};

export function TableToolbar(props: TableToolbarProps) {
  const { t, getLocale } = useI18n();
  const fields = () => props.fields ?? [];
  const filters = () => props.filters ?? [];
  const describe = (field: FilterField, value: FilterValue) => {
    if (isDateRangeValue(value)) {
      return value.preset ? t(`table.filters.date.${value.preset}`) : formatDateRange(value, getLocale());
    }
    const values = Array.isArray(value) ? value : [value];
    const names = values.map(item => field.type === 'date-range' ? item : field.options.find(option => option.value === item)?.label ?? item);
    return names.length > 2 ? `${names[0]} +${names.length - 1}` : names.join(', ');
  };

  return (
    <div class={cn('mb-4 flex flex-col gap-2', props.class)}>
      <div class="flex flex-wrap items-center gap-2">
        <Show when={props.onSearchChange}>
          <div class="relative w-full min-w-0 sm:w-60">
            <div class="i-tabler-search pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
            <TextField type="search" value={props.search ?? ''} onInput={event => props.onSearchChange?.(event.currentTarget.value)} placeholder={props.searchPlaceholder ?? t('table.search.placeholder')} class="h-9 pl-9 pr-9" />
            <Show when={props.searchLoading}><div class="i-tabler-loader-2 absolute right-3 top-1/2 size-4 -translate-y-1/2 animate-spin text-muted-foreground" /></Show>
          </div>
        </Show>
        <Show when={fields().length > 0 && props.onFiltersChange}>
          <TableFilterMenu fields={fields()} value={filters()} onChange={value => props.onFiltersChange?.(value)} />
        </Show>
        {props.actions}
      </div>
      <Show when={filters().length > 0}>
        <div class="flex flex-wrap items-center gap-2">
          <For each={filters()}>
            {(filter) => {
              const field = () => fields().find(item => item.id === filter.fieldId);
              return (
                <Show when={field()}>
                  {item => (
                    <span class="inline-flex h-8 max-w-full items-center overflow-hidden rounded-full border bg-background text-xs shadow-xs">
                      <span class="flex min-w-0 items-center gap-1.5 pl-2.5 pr-2">
                        <Show when={item().icon}><div class={`${item().icon} size-3.5 text-muted-foreground`} /></Show>
                        <span class="text-muted-foreground">{item().label}</span>
                        <span class="max-w-48 truncate font-medium">{describe(item(), filter.value)}</span>
                      </span>
                      <Show when={!item().required}>
                        <button type="button" aria-label={t('table.filters.remove')} class="flex size-8 items-center justify-center border-l text-muted-foreground hover:bg-accent hover:text-foreground" onClick={() => props.onFiltersChange?.(props.filters!.filter(value => value.fieldId !== filter.fieldId))}><div class="i-tabler-x size-3.5" /></button>
                      </Show>
                    </span>
                  )}
                </Show>
              );
            }}
          </For>
        </div>
      </Show>
    </div>
  );
}
