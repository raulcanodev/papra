import type { Component } from 'solid-js';
import { useParams } from '@solidjs/router';
import { keepPreviousData, useQuery } from '@tanstack/solid-query';
import { Show, Suspense } from 'solid-js';
import { useI18n } from '@/modules/i18n/i18n.provider';
import { createParamSynchronizedPagination } from '@/modules/shared/pagination/query-synchronized-pagination';
import { createParamSynchronizedSignal } from '@/modules/shared/signals/params';
import { cn } from '@/modules/shared/style/cn';
import { useDebounce } from '@/modules/shared/utils/timing';
import { Button } from '@/modules/ui/components/button';
import { TextField, TextFieldRoot } from '@/modules/ui/components/textfield';
import { useDocumentUpload } from '../components/document-import-status.component';
import { DocumentUploadArea } from '../components/document-upload-area.component';
import { createdAtColumn, DocumentsPaginatedList, standardActionsColumn, tagsColumn } from '../components/documents-list.component';
import { fetchOrganizationDocuments } from '../documents.services';

export const DocumentsPage: Component = () => {
  const params = useParams();
  const { t } = useI18n();
  const { promptImport } = useDocumentUpload();
  const [getSearchQuery, setSearchQuery] = createParamSynchronizedSignal<string>({ paramKey: 'query', defaultValue: '' });
  const debouncedSearchQuery = useDebounce(getSearchQuery, 300);
  const [getPagination, setPagination] = createParamSynchronizedPagination();

  const documentsQuery = useQuery(() => ({
    queryKey: ['organizations', params.organizationId, 'documents', getPagination(), debouncedSearchQuery()],
    queryFn: () => fetchOrganizationDocuments({
      organizationId: params.organizationId,
      searchQuery: debouncedSearchQuery(),
      ...getPagination(),
    }),
    placeholderData: keepPreviousData,
  }));

  return (
    <div class="flex flex-col h-full">
      {/* Header */}
      <div class="border-b px-6 py-3 flex items-center justify-between shrink-0 bg-background">
        <div>
          <h1 class="text-sm font-semibold leading-none">{t('documents.list.title')}</h1>
          <p class="text-xs text-muted-foreground mt-0.5">{t('documents.list.no-documents.description')}</p>
        </div>
        <div class="flex items-center gap-2">
          <Button variant="outline" size="sm" class="h-8 text-xs gap-1.5" onClick={promptImport}>
            <div class="i-tabler-upload size-3.5" />
            Import
          </Button>
        </div>
      </div>

      <div class="p-6 pb-32 max-w-5xl mx-auto w-full overflow-y-auto flex-1">
      <Suspense>
        {documentsQuery.data?.documents?.length === 0 && debouncedSearchQuery().length === 0
          ? (
              <DocumentUploadArea />
            )
          : (
              <>
                <div class="flex items-center">
                  <TextFieldRoot class="max-w-md flex-1">
                    <TextField
                      type="search"
                      name="search"
                      placeholder={t('documents.list.search.placeholder')}
                      value={getSearchQuery()}
                      onInput={e => setSearchQuery(e.currentTarget.value)}
                      class="pr-9"
                      autofocus
                    />
                  </TextFieldRoot>

                  <Show when={getSearchQuery().length > 0}>
                    <Button
                      variant="ghost"
                      size="icon"
                      class="size-6 ml--8"
                      disabled={documentsQuery.isFetching}
                      onClick={() => setSearchQuery('')}
                      aria-label={documentsQuery.isFetching ? 'Loading' : 'Clear search'}
                    >
                      <div
                        class={cn('text-muted-foreground', documentsQuery.isFetching ? 'i-tabler-loader-2 animate-spin' : 'i-tabler-x')}
                      />
                    </Button>
                  </Show>

                </div>
                <div class="mb-4 text-sm text-muted-foreground mt-2 ml-2">
                  <Show
                    when={debouncedSearchQuery().length > 0}
                    fallback={t('documents.list.search.total-count-no-query', { count: documentsQuery.data?.documentsCount ?? 0 })}
                  >
                    {t('documents.list.search.total-count-with-query', { count: documentsQuery.data?.documentsCount ?? 0 })}
                  </Show>
                </div>

                <Show when={debouncedSearchQuery().length > 0 && documentsQuery.data?.documents.length === 0}>
                  <p class="text-muted-foreground mt-1 mb-6">
                    {t('documents.list.no-results')}
                  </p>
                </Show>

                <DocumentsPaginatedList
                  documents={documentsQuery.data?.documents ?? []}
                  documentsCount={documentsQuery.data?.documentsCount ?? 0}
                  getPagination={getPagination}
                  setPagination={setPagination}
                  extraColumns={[
                    tagsColumn,
                    createdAtColumn,
                    standardActionsColumn,
                  ]}
                />
              </>
            )}
      </Suspense>
      </div>
    </div>
  );
};
