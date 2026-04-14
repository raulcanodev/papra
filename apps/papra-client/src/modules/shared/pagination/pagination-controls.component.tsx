import type { Accessor, Component, Setter } from 'solid-js';
import type { Pagination } from './pagination.types';
import { Show } from 'solid-js';
import { useI18n } from '@/modules/i18n/i18n.provider';
import { Button } from '@/modules/ui/components/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/modules/ui/components/select';

export const PaginationControls: Component<{
  getPagination: Accessor<Pagination>;
  setPagination: Setter<Pagination>;
  totalCount: number;
  pageSizeOptions?: number[];
}> = (props) => {
  const { t } = useI18n();

  const pageSizeOptions = () => props.pageSizeOptions ?? [15, 50, 100];
  const pageIndex = () => props.getPagination().pageIndex;
  const pageSize = () => props.getPagination().pageSize;
  const totalPages = () => Math.max(1, Math.ceil(props.totalCount / pageSize()));
  const canPreviousPage = () => pageIndex() > 0;
  const canNextPage = () => (pageIndex() + 1) < totalPages();

  return (
    <Show when={props.totalCount > 0}>
      <div class="flex flex-col-reverse items-center gap-4 sm:flex-row sm:justify-end mt-4">
        <div class="flex items-center space-x-2">
          <p class="whitespace-nowrap text-sm font-medium">
            {t('common.tables.rows-per-page')}
          </p>
          <Select
            value={pageSize()}
            onChange={(value) => {
              if (value) {
                props.setPagination({ pageIndex: 0, pageSize: value });
              }
            }}
            options={pageSizeOptions()}
            itemComponent={prps => (
              <SelectItem item={prps.item}>
                {prps.item.rawValue}
              </SelectItem>
            )}
          >
            <SelectTrigger class="h-8 w-[4.5rem]">
              <SelectValue<string>>
                {state => state.selectedOption()}
              </SelectValue>
            </SelectTrigger>
            <SelectContent />
          </Select>
        </div>

        <div class="flex items-center justify-center whitespace-nowrap text-sm font-medium">
          {t('common.tables.pagination-info', {
            currentPage: pageIndex() + 1,
            totalPages: totalPages(),
          })}
        </div>

        <div class="flex items-center space-x-2">
          <Button
            aria-label="Go to first page"
            variant="outline"
            class="flex size-8 p-0"
            onClick={() => props.setPagination(p => ({ ...p, pageIndex: 0 }))}
            disabled={!canPreviousPage()}
          >
            <div class="size-4 i-tabler-chevrons-left" />
          </Button>
          <Button
            aria-label="Go to previous page"
            variant="outline"
            size="icon"
            class="size-8"
            onClick={() => props.setPagination(p => ({ ...p, pageIndex: p.pageIndex - 1 }))}
            disabled={!canPreviousPage()}
          >
            <div class="size-4 i-tabler-chevron-left" />
          </Button>
          <Button
            aria-label="Go to next page"
            variant="outline"
            size="icon"
            class="size-8"
            onClick={() => props.setPagination(p => ({ ...p, pageIndex: p.pageIndex + 1 }))}
            disabled={!canNextPage()}
          >
            <div class="size-4 i-tabler-chevron-right" />
          </Button>
          <Button
            aria-label="Go to last page"
            variant="outline"
            size="icon"
            class="flex size-8"
            onClick={() => props.setPagination(p => ({ ...p, pageIndex: totalPages() - 1 }))}
            disabled={!canNextPage()}
          >
            <div class="size-4 i-tabler-chevrons-right" />
          </Button>
        </div>
      </div>
    </Show>
  );
};
