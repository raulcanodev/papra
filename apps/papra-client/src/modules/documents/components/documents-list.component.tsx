import type { ColumnDef } from '@tanstack/solid-table';
import type { Accessor, Component, Setter } from 'solid-js';
import type { Document } from '../documents.types';
import type { Pagination } from '@/modules/shared/pagination/pagination.types';
import type { Tag } from '@/modules/tags/tags.types';
import { formatBytes } from '@corentinth/chisels';
import { A } from '@solidjs/router';
import {
  createSolidTable,
  flexRender,
  getCoreRowModel,
  getPaginationRowModel,
} from '@tanstack/solid-table';
import { For, Match, Show, Switch } from 'solid-js';
import { RelativeTime } from '@/modules/i18n/components/RelativeTime';
import { useI18n } from '@/modules/i18n/i18n.provider';
import { PaginationControls } from '@/modules/shared/pagination/pagination-controls.component';
import { cn } from '@/modules/shared/style/cn';
import { DocumentTagsList } from '@/modules/tags/components/tag-list.component';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/modules/ui/components/table';
import { getDocumentIcon, getDocumentNameExtension, getDocumentNameWithoutExtension } from '../document.models';
import { DocumentManagementDropdown } from './document-management-dropdown.component';

export const createdAtColumn: ColumnDef<Document> = {
  header: () => {
    const { t } = useI18n();
    return <span class="hidden sm:block">{t('documents.list.table.headers.created')}</span>;
  },
  accessorKey: 'createdAt',
  cell: data => <RelativeTime class="text-muted-foreground hidden sm:block" date={data.getValue<Date>()} />,
};

export const deletedAtColumn: ColumnDef<Document> = {
  header: () => {
    const { t } = useI18n();
    return <span class="hidden sm:block">{t('documents.list.table.headers.deleted')}</span>;
  },
  accessorKey: 'deletedAt',
  cell: data => <RelativeTime class="text-muted-foreground hidden sm:block" date={data.getValue<Date>()} />,
};

export const standardActionsColumn: ColumnDef<Document> = {
  header: () => {
    const { t } = useI18n();
    return <span class="block text-right">{t('documents.list.table.headers.actions')}</span>;
  },
  id: 'actions',
  cell: data => (
    <div class="flex items-center justify-end">
      <DocumentManagementDropdown document={data.row.original} />
    </div>
  ),
};

export const tagsColumn: ColumnDef<Document> = {
  header: () => {
    const { t } = useI18n();
    return <span class="hidden sm:block">{t('documents.list.table.headers.tags')}</span>;
  },
  accessorKey: 'tags',
  cell: data => (
    <DocumentTagsList
      tags={data.getValue<Tag[]>()}
      tagClass="text-xs text-muted-foreground"
      triggerClass="size-6"
      documentId={data.row.original.id}
      organizationId={data.row.original.organizationId}
      asLink
    />
  ),
};

export const DocumentsPaginatedList: Component<{
  documents: Document[];
  documentsCount: number;
  getPagination?: Accessor<Pagination>;
  setPagination?: Setter<Pagination>;
  extraColumns?: ColumnDef<Document>[];
  showPagination?: boolean;
}> = (props) => {
  const { t } = useI18n();
  const table = createSolidTable({
    get data() {
      return props.documents ?? [];
    },
    columns: [
      {
        header: () => t('documents.list.table.headers.file-name'),
        id: 'fileName',
        cell: data => (
          <div class="overflow-hidden flex gap-4 items-center max-w-500px">
            <div class="bg-muted flex items-center justify-center p-2 rounded-lg">
              <div
                class={cn(
                  getDocumentIcon({ document: data.row.original }),
                  'size-6 text-primary',
                )}
              />
            </div>

            <div class="flex-1 flex flex-col gap-1 truncate">
              <A
                href={`/organizations/${data.row.original.organizationId}/documents/${data.row.original.id}`}
                class="font-bold truncate block hover:underline"
                title={data.row.original.name}
              >
                {getDocumentNameWithoutExtension({
                  name: data.row.original.name,
                })}
              </A>

              <div class="text-xs text-muted-foreground lh-tight">
                {[formatBytes({ bytes: data.row.original.originalSize, base: 1000 }), getDocumentNameExtension({ name: data.row.original.name })].filter(Boolean).join(' - ')}
                {' '}
                -
                {' '}
                <RelativeTime date={data.row.original.createdAt} />
              </div>
            </div>
          </div>
        ),
      },
      ...(props.extraColumns ?? []),
    ],
    get rowCount() {
      return props.documentsCount;
    },
    getCoreRowModel: getCoreRowModel(),
    getPaginationRowModel: getPaginationRowModel(),
    onPaginationChange: props.setPagination,
    state: {
      get pagination() {
        return props.getPagination?.();
      },
    },
    manualPagination: true,
  });

  return (
    <div>
      <Switch>
        <Match when={props.documentsCount > 0}>
          <Table>
            <TableHeader>
              <For each={table.getHeaderGroups()}>
                {headerGroup => (
                  <TableRow>
                    <For each={headerGroup.headers}>
                      {(header) => {
                        return (
                          <TableHead>
                            {header.isPlaceholder
                              ? null
                              : flexRender(
                                  header.column.columnDef.header,
                                  header.getContext(),
                                )}
                          </TableHead>
                        );
                      }}
                    </For>
                  </TableRow>
                )}
              </For>
            </TableHeader>

            <TableBody>
              <Show when={table.getRowModel().rows?.length}>
                <For each={table.getRowModel().rows}>
                  {row => (
                    <TableRow data-state={row.getIsSelected() && 'selected'}>
                      <For each={row.getVisibleCells()}>
                        {cell => (
                          <TableCell>
                            {flexRender(
                              cell.column.columnDef.cell,
                              cell.getContext(),
                            )}
                          </TableCell>
                        )}
                      </For>
                    </TableRow>
                  )}
                </For>
              </Show>
            </TableBody>
          </Table>

          <Show when={props.showPagination ?? true}>
            <Show when={props.getPagination && props.setPagination}>
              <PaginationControls
                getPagination={props.getPagination!}
                setPagination={props.setPagination!}
                totalCount={props.documentsCount}
              />
            </Show>
          </Show>
        </Match>
      </Switch>
    </div>
  );
};
