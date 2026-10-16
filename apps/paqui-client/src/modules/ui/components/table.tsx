import type { ComponentProps } from 'solid-js';
import type { TableToolbarProps } from './table-toolbar';
import { splitProps } from 'solid-js';
import { cn } from '@/modules/shared/style/cn';
import { STACKED_TABLE_CLASS, useStackedTableLabels } from './stacked-table';
import { TableToolbar } from './table-toolbar';

/** `stacked`: rows become cards on phones instead of a table wider than the screen (on by default) */
export function Table(props: ComponentProps<'table'> & { toolbar?: TableToolbarProps; stacked?: boolean }) {
  const [local, rest] = splitProps(props, ['class', 'toolbar', 'stacked', 'ref']);
  let table: HTMLTableElement | undefined;
  useStackedTableLabels(() => (local.stacked === false ? undefined : table));

  return (
    <>
      {local.toolbar && <TableToolbar {...local.toolbar} />}
      <div class={cn('w-full', local.stacked === false ? 'overflow-auto' : 'md:overflow-auto')}>
        <table
          ref={(element) => {
            table = element;
            (local.ref as ((element: HTMLTableElement) => void) | undefined)?.(element);
          }}
          class={cn('w-full caption-bottom text-sm text-nowrap', local.stacked !== false && STACKED_TABLE_CLASS, local.class)}
          {...rest}
        />
      </div>
    </>
  );
}

export function TableHeader(props: ComponentProps<'thead'>) {
  const [local, rest] = splitProps(props, ['class']);

  return <thead class={cn('[&_tr]:border-b', local.class)} {...rest} />;
}

export function TableBody(props: ComponentProps<'tbody'>) {
  const [local, rest] = splitProps(props, ['class']);

  return (
    <tbody class={cn('[&_tr:last-child]:border-0', local.class)} {...rest} />
  );
}

export function TableFooter(props: ComponentProps<'tfoot'>) {
  const [local, rest] = splitProps(props, ['class']);

  return (
    <tbody
      class={cn('bg-primary font-medium text-primary-foreground', local.class)}
      {...rest}
    />
  );
}

export function TableRow(props: ComponentProps<'tr'>) {
  const [local, rest] = splitProps(props, ['class']);

  return (
    <tr
      class={cn(
        'border-b border-border/70 transition-colors hover:bg-muted/40 data-[state=selected]:bg-muted',
        local.class,
      )}
      {...rest}
    />
  );
}

export function TableHead(props: ComponentProps<'th'>) {
  const [local, rest] = splitProps(props, ['class']);

  return (
    <th
      class={cn(
        'h-10 px-3 text-left align-middle text-xs font-medium text-muted-foreground [&:has([role=checkbox])]:pr-0 [&>[role=checkbox]]:translate-y-[2px]',
        local.class,
      )}
      {...rest}
    />
  );
}

export function TableCell(props: ComponentProps<'td'>) {
  const [local, rest] = splitProps(props, ['class']);

  return (
    <td
      class={cn(
        'px-3 py-2.5 align-middle [&:has([role=checkbox])]:pr-0 [&>[role=checkbox]]:translate-y-[2px]',
        local.class,
      )}
      {...rest}
    />
  );
}

export function TableCaption(props: ComponentProps<'caption'>) {
  const [local, rest] = splitProps(props, ['class']);

  return (
    <caption
      class={cn('mt-4 text-sm text-muted-foreground', local.class)}
      {...rest}
    />
  );
}
