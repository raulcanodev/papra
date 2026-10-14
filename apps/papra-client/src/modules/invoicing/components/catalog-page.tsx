import type { JSX, ParentProps } from 'solid-js';
import { For, Show } from 'solid-js';
import { useI18n } from '@/modules/i18n/i18n.provider';
import { cn } from '@/modules/shared/style/cn';
import { Button } from '@/modules/ui/components/button';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/modules/ui/components/dialog';
import { Popover, PopoverContent, PopoverTrigger } from '@/modules/ui/components/popover';
import { TextField } from '@/modules/ui/components/textfield';

export function FormField(props: ParentProps<{ label: string; class?: string }>) {
  return (
    <label class={cn('block text-sm font-medium', props.class)}>
      {props.label}
      <div class="mt-1.5 font-normal">{props.children}</div>
    </label>
  );
}

export function CatalogPage(props: ParentProps<{ title: string; description: string; actionLabel: string; editLabel?: string; editing?: boolean; formDescription?: string; form: JSX.Element; formOpen: boolean; onFormOpenChange: (open: boolean) => void; search: string; onSearchChange: (value: string) => void; empty: boolean; loading: boolean; filter?: JSX.Element }>) {
  const { t } = useI18n();
  return (
    <main class="page">
      <div class="page-header">
        <div>
          <h1 class="page-title">{props.title}</h1>
          <p class="page-description">{props.description}</p>
        </div>
        <Button size="sm" class="gap-1.5" onClick={() => props.onFormOpenChange(true)}>
          <div class="i-tabler-plus size-4" />
          {props.actionLabel}
        </Button>
      </div>
      <Dialog open={props.formOpen} onOpenChange={props.onFormOpenChange}>
        <DialogContent class="max-w-xl">
          <DialogHeader>
            <DialogTitle>{props.editing ? (props.editLabel ?? t('invoicing.common.edit')) : props.actionLabel}</DialogTitle>
            <Show when={props.formDescription}>
              <DialogDescription>{props.formDescription}</DialogDescription>
            </Show>
          </DialogHeader>
          {props.form}
        </DialogContent>
      </Dialog>
      <div class="flex items-center gap-2 mb-3">
        <div class="relative w-full max-w-sm">
          <div class="i-tabler-search absolute left-3 top-2.5 size-4 text-muted-foreground" />
          <TextField value={props.search} onInput={event => props.onSearchChange(event.currentTarget.value)} placeholder={t('invoicing.common.search')} class="pl-9" />
        </div>
        {props.filter}
      </div>
      <Show when={!props.empty || props.loading}>{props.children}</Show>
      <Show when={!props.loading && props.empty}><div class="rounded-xl border border-dashed py-14 text-center text-sm text-muted-foreground">{t('invoicing.common.no-results')}</div></Show>
    </main>
  );
}

export function CatalogTable(props: ParentProps<{ headers: Array<{ label: string; class?: string }> }>) {
  return (
    <div class="overflow-x-auto rounded-xl border border-border/80 bg-card shadow-xs dark:shadow-none">
      <table class="w-full min-w-[720px] text-sm">
        <thead class="border-b bg-muted/30 text-xs text-muted-foreground"><tr><For each={props.headers}>{header => <th class={cn('h-10 px-4 text-left font-medium', header.class)}>{header.label}</th>}</For></tr></thead>
        <tbody class="divide-y">{props.children}</tbody>
      </table>
    </div>
  );
}

export function CatalogRow(props: ParentProps<{ onClick?: () => void; class?: string }>) {
  return <tr class={cn('transition-colors hover:bg-muted/25', props.onClick && 'cursor-pointer', props.class)} onClick={() => props.onClick?.()}>{props.children}</tr>;
}

export function CatalogCell(props: ParentProps<{ class?: string }>) {
  return <td class={cn('h-12 px-4 align-middle', props.class)}>{props.children}</td>;
}

export function FilterMenu(props: { label?: string; options: Array<{ label: string; value: string }>; values: string[]; onChange: (values: string[]) => void }) {
  const { t } = useI18n();
  const toggle = (value: string) => props.onChange(props.values.includes(value) ? props.values.filter(item => item !== value) : [...props.values, value]);
  return (
    <Popover>
      <PopoverTrigger as={Button} variant="outline" size="sm" class={cn('gap-1.5', props.values.length > 0 && 'border-primary/50')}>
        <div class="i-tabler-adjustments-horizontal size-4" />
        {props.label ?? t('invoicing.common.filters')}
        <Show when={props.values.length}><span class="rounded-full bg-primary px-1.5 text-[10px] font-semibold text-primary-foreground">{props.values.length}</span></Show>
      </PopoverTrigger>
      <PopoverContent class="w-56 p-1.5">
        <div class="px-2 py-1.5 text-xs font-medium text-muted-foreground">{props.label ?? t('invoicing.common.filter-by')}</div>
        <For each={props.options}>
          {option => (
            <button type="button" class="flex w-full items-center gap-2 rounded-md px-2 py-2 text-sm hover:bg-accent" onClick={() => toggle(option.value)}>
              <span class={cn('size-4 rounded border flex items-center justify-center', props.values.includes(option.value) && 'bg-primary border-primary text-primary-foreground')}><Show when={props.values.includes(option.value)}><div class="i-tabler-check size-3" /></Show></span>
              {option.label}
            </button>
          )}
        </For>
        <Show when={props.values.length}><button type="button" class="mt-1 w-full border-t px-2 pt-2 pb-1 text-left text-xs text-muted-foreground hover:text-foreground" onClick={() => props.onChange([])}>{t('invoicing.common.clear-filters')}</button></Show>
      </PopoverContent>
    </Popover>
  );
}

/** Dialog footer for catalog forms: spans the whole form grid. */
export function SaveButton(props: { loading: boolean; editing: boolean; onCancel: () => void }) {
  const { t } = useI18n();
  return (
    <div class="col-span-full mt-2 flex justify-end gap-2">
      <Button type="button" variant="ghost" onClick={() => props.onCancel()}>{t('invoicing.common.cancel')}</Button>
      <Button type="submit" variant="primary" isLoading={props.loading}>{props.editing ? t('invoicing.common.save-changes') : t('invoicing.common.create')}</Button>
    </div>
  );
}
