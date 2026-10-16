import type { JSX, ParentProps } from 'solid-js';
import type { ActiveFilter, FilterField } from '@/modules/ui/components/table-filters';
import { For, Show } from 'solid-js';
import { useI18n } from '@/modules/i18n/i18n.provider';
import { cn } from '@/modules/shared/style/cn';
import { Button } from '@/modules/ui/components/button';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/modules/ui/components/dialog';
import { TableToolbar } from '@/modules/ui/components/table-toolbar';

export function FormField(props: ParentProps<{ label: string; class?: string }>) {
  return (
    <label class={cn('block text-sm font-medium', props.class)}>
      {props.label}
      <div class="mt-1.5 font-normal">{props.children}</div>
    </label>
  );
}

export function CatalogPage(props: ParentProps<{ title: string; description: string; actionLabel: string; editLabel?: string; editing?: boolean; formDescription?: string; form: JSX.Element; formOpen: boolean; onFormOpenChange: (open: boolean) => void; search: string; onSearchChange: (value: string) => void; empty: boolean; loading: boolean; filterFields?: FilterField[]; filters?: ActiveFilter[]; onFiltersChange?: (value: ActiveFilter[]) => void; filter?: JSX.Element }>) {
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
      <TableToolbar
        search={props.search}
        onSearchChange={props.onSearchChange}
        searchPlaceholder={t('invoicing.common.search')}
        fields={props.filterFields}
        filters={props.filters}
        onFiltersChange={props.onFiltersChange}
        actions={props.filter}
      />
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
