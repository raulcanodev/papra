/* eslint-disable style/jsx-one-expression-per-line */
import type { ColumnDef } from '@tanstack/solid-table';
import type { Component } from 'solid-js';
import type { Document } from '../documents.types';
import { useParams } from '@solidjs/router';
import { createMutation, keepPreviousData, useQuery } from '@tanstack/solid-query';
import { createSignal, For, Show, Suspense } from 'solid-js';
import { useI18n } from '@/modules/i18n/i18n.provider';
import { createParamSynchronizedPagination } from '@/modules/shared/pagination/query-synchronized-pagination';
import { queryClient } from '@/modules/shared/query/query-client';
import { createParamSynchronizedSignal } from '@/modules/shared/signals/params';
import { cn } from '@/modules/shared/style/cn';
import { useDebounce } from '@/modules/shared/utils/timing';
import { Badge } from '@/modules/ui/components/badge';
import { Button } from '@/modules/ui/components/button';
import { createToast } from '@/modules/ui/components/sonner';
import { Tabs, TabsIndicator, TabsList, TabsTrigger } from '@/modules/ui/components/tabs';
import { TextField, TextFieldRoot } from '@/modules/ui/components/textfield';
import { useDocumentUpload } from '../components/document-import-status.component';
import { DocumentUploadArea } from '../components/document-upload-area.component';
import { createdAtColumn, DocumentsPaginatedList, standardActionsColumn, tagsColumn } from '../components/documents-list.component';
import { createDocumentFolder, fetchDocumentFolders, fetchFolderDocuments, fetchOrganizationDocuments } from '../documents.services';

const FolderHeader: Component = () => {
  const { t } = useI18n();
  return <span class="hidden md:block">{t('documents.list.table.headers.folder')}</span>;
};

const folderColumn: ColumnDef<Document> = {
  header: () => <FolderHeader />,
  id: 'folder',
  cell: data => (
    <Show
      when={data.row.original.folder}
      fallback={<span class="hidden text-sm text-muted-foreground md:block">—</span>}
    >
      {folder => (
        <Badge variant="outline" class="hidden max-w-48 gap-1.5 bg-muted/30 font-normal md:inline-flex">
          <div class="i-tabler-folder size-3.5 shrink-0 text-muted-foreground" />
          <span class="truncate">{folder().name}</span>
        </Badge>
      )}
    </Show>
  ),
};

export const DocumentsPage: Component = () => {
  const params = useParams();
  const { t } = useI18n();
  const { promptImport } = useDocumentUpload();
  const [getView, setView] = createParamSynchronizedSignal<'all' | 'folders'>({ paramKey: 'view', defaultValue: 'all' });
  const [getFolderId, setFolderId] = createParamSynchronizedSignal<string>({ paramKey: 'folder', defaultValue: '' });
  const [getSearchQuery, setSearchQuery] = createParamSynchronizedSignal<string>({ paramKey: 'query', defaultValue: '' });
  const debouncedSearchQuery = useDebounce(getSearchQuery, 300);
  const [getPagination, setPagination] = createParamSynchronizedPagination();
  const [newFolderName, setNewFolderName] = createSignal('');

  const foldersQuery = useQuery(() => ({ queryKey: ['organizations', params.organizationId, 'document-folders'], queryFn: () => fetchDocumentFolders({ organizationId: params.organizationId }) }));
  const allDocumentsQuery = useQuery(() => ({
    queryKey: ['organizations', params.organizationId, 'documents', getPagination(), debouncedSearchQuery()],
    queryFn: () => fetchOrganizationDocuments({ organizationId: params.organizationId, searchQuery: debouncedSearchQuery(), ...getPagination() }),
    placeholderData: keepPreviousData,
    enabled: getView() === 'all',
  }));
  const folderDocumentsQuery = useQuery(() => ({
    queryKey: ['organizations', params.organizationId, 'document-folders', getFolderId(), 'documents', getPagination(), debouncedSearchQuery()],
    queryFn: () => fetchFolderDocuments({ organizationId: params.organizationId, folderId: getFolderId(), searchQuery: debouncedSearchQuery(), ...getPagination() }),
    placeholderData: keepPreviousData,
    enabled: getView() === 'folders' && getFolderId() !== '',
  }));
  const createFolderMutation = createMutation(() => ({
    mutationFn: () => createDocumentFolder({ organizationId: params.organizationId, name: newFolderName() }),
    onSuccess: async () => {
      setNewFolderName('');
      await queryClient.invalidateQueries({ queryKey: ['organizations', params.organizationId, 'document-folders'] });
      createToast({ type: 'success', message: t('documents.folders.toast.created') });
    },
    onError: () => createToast({ type: 'error', message: t('documents.folders.toast.error') }),
  }));
  const activeQuery = () => getView() === 'all' ? allDocumentsQuery : folderDocumentsQuery;
  const activeFolder = () => foldersQuery.data?.folders.find(folder => folder.id === getFolderId());
  const resetPage = () => setPagination(pagination => ({ ...pagination, pageIndex: 0 }));

  return (
    <div class="page">
      <div class="page-header gap-4">
        <div>
          <h1 class="page-title">{t('documents.list.title')}</h1>
          <p class="page-description">{t('documents.list.description')}</p>
        </div>
        <Button size="sm" class="h-9 shrink-0 gap-1.5" onClick={promptImport}>
          <div class="i-tabler-upload size-4" />
          {t('documents.list.import')}
        </Button>
      </div>
      <div>
        <div class="mb-5">
          <Tabs
            value={getView()}
            onChange={(value) => {
              setView(value as 'all' | 'folders');
              if (value === 'all') {
                setFolderId('');
              }
              resetPage();
            }}
          >
            <TabsList class="h-11 w-full bg-muted/60 p-1 sm:w-fit">
              <TabsTrigger value="all" class="h-9 gap-2 px-3 sm:min-w-44">
                <div class="i-tabler-files size-4" />
                <span>{t('documents.list.view.all')}</span>
                <Show when={allDocumentsQuery.data}>
                  {data => <span class="rounded-full bg-background/70 px-1.5 py-0.5 text-[11px] tabular-nums text-muted-foreground">{data().documentsCount}</span>}
                </Show>
              </TabsTrigger>
              <TabsTrigger value="folders" class="h-9 gap-2 px-3 sm:min-w-36">
                <div class="i-tabler-folders size-4" />
                <span>{t('documents.list.view.folders')}</span>
                <Show when={foldersQuery.data}>
                  {data => <span class="rounded-full bg-background/70 px-1.5 py-0.5 text-[11px] tabular-nums text-muted-foreground">{data().folders.length}</span>}
                </Show>
              </TabsTrigger>
              <TabsIndicator />
            </TabsList>
          </Tabs>
        </div>

        <Show when={getView() === 'folders' && getFolderId() === ''}>
          <div class="overflow-hidden rounded-xl border border-border/80 bg-card shadow-[0_1px_2px_rgb(0_0_0/0.04)] dark:shadow-none">
            <div class="flex flex-col gap-4 border-b border-border/70 p-4 sm:flex-row sm:items-center sm:justify-between sm:p-5">
              <div>
                <h2 class="font-semibold">{t('documents.folders.heading')}</h2>
                <p class="mt-1 text-sm text-muted-foreground">{t('documents.folders.description')}</p>
              </div>
              <form
                class="flex w-full gap-2 sm:w-auto"
                onSubmit={(event) => {
                  event.preventDefault();
                  if (newFolderName().trim()) {
                    createFolderMutation.mutate();
                  }
                }}
              >
                <TextField class="h-9 min-w-0 flex-1 sm:w-52" placeholder={t('documents.folders.new.placeholder')} value={newFolderName()} onInput={event => setNewFolderName(event.currentTarget.value)} />
                <Button size="sm" class="h-9 shrink-0" type="submit" disabled={createFolderMutation.isPending || !newFolderName().trim()}>
                  <div class={cn('mr-1.5 size-4', createFolderMutation.isPending ? 'i-tabler-loader-2 animate-spin' : 'i-tabler-folder-plus')} />
                  {t('documents.folders.new.submit')}
                </Button>
              </form>
            </div>
            <div class="p-4 sm:p-5">
              <Show
                when={(foldersQuery.data?.folders.length ?? 0) > 0}
                fallback={(
                  <div class="rounded-xl border border-dashed px-6 py-14 text-center">
                    <div class="mx-auto mb-3 flex size-11 items-center justify-center rounded-xl bg-muted">
                      <div class="i-tabler-folder-plus size-5 text-muted-foreground" />
                    </div>
                    <p class="mx-auto max-w-md text-sm text-muted-foreground">{t('documents.folders.empty')}</p>
                  </div>
                )}
              >
                <div class="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
                  <For each={foldersQuery.data?.folders}>{folder => (
                    <button
                      type="button"
                      class="group flex min-w-0 items-center gap-3 rounded-xl border border-border/80 bg-background p-4 text-left transition-all hover:border-primary/40 hover:bg-muted/25 hover:shadow-sm focus-visible:(outline-none ring-1.5 ring-ring ring-offset-2)"
                      onClick={() => {
                        setFolderId(folder.id);
                        resetPage();
                      }}
                    >
                      <div class="flex size-11 shrink-0 items-center justify-center rounded-xl bg-primary/8 text-primary transition-colors group-hover:bg-primary/12">
                        <Show when={folder.kind === 'customer'} fallback={<div class="i-tabler-folder size-5" />}>
                          <div class="i-tabler-folder-star size-5" />
                        </Show>
                      </div>
                      <div class="min-w-0 flex-1">
                        <div class="flex items-center gap-2">
                          <span class="truncate font-medium">{folder.name}</span>
                          <Show when={folder.kind === 'customer'}>
                            <Badge variant="outline" class="shrink-0 bg-muted/40 px-1.5 py-0 text-[10px] text-muted-foreground">{t('documents.folders.customer-label')}</Badge>
                          </Show>
                        </div>
                        <div class="mt-1 text-xs tabular-nums text-muted-foreground">{t('documents.folders.count', { count: folder.documentsCount })}</div>
                      </div>
                      <div class="i-tabler-chevron-right size-4 shrink-0 text-muted-foreground/60 transition-transform group-hover:translate-x-0.5 group-hover:text-foreground" />
                    </button>
                  )}
                  </For>
                </div>
              </Show>
            </div>
          </div>
        </Show>

        <Show when={getView() === 'all' || getFolderId() !== ''}>
          <Show when={getView() === 'folders'}>
            <div class="mb-4 flex items-center gap-3 rounded-xl border border-border/80 bg-card p-3 sm:p-4">
              <Button variant="ghost" size="icon" class="size-9 shrink-0" aria-label={t('documents.folders.back')} onClick={() => setFolderId('')}>
                <div class="i-tabler-arrow-left size-4" />
              </Button>
              <div class="flex size-10 shrink-0 items-center justify-center rounded-xl bg-primary/8 text-primary">
                <Show when={activeFolder()?.kind === 'customer'} fallback={<div class="i-tabler-folder-open size-5" />}>
                  <div class="i-tabler-folder-star size-5" />
                </Show>
              </div>
              <div class="min-w-0">
                <div class="truncate font-semibold">{activeFolder()?.name}</div>
                <div class="text-xs text-muted-foreground">{t('documents.folders.count', { count: activeFolder()?.documentsCount ?? 0 })}</div>
              </div>
            </div>
          </Show>
          <Suspense>
            <Show
              when={(activeQuery().data?.documents.length ?? 0) > 0 || debouncedSearchQuery().length > 0}
              fallback={getView() === 'all'
                ? <DocumentUploadArea />
                : (
                    <div class="rounded-xl border border-dashed px-6 py-14 text-center">
                      <div class="mx-auto mb-3 flex size-11 items-center justify-center rounded-xl bg-muted">
                        <div class="i-tabler-folder-off size-5 text-muted-foreground" />
                      </div>
                      <p class="text-sm text-muted-foreground">{t('documents.folders.folder-empty')}</p>
                    </div>
                  )}
            >
              <div class="mb-4 flex items-center">
                <TextFieldRoot class="relative max-w-md flex-1">
                  <div class="pointer-events-none absolute left-3 top-1/2 z-10 size-4 -translate-y-1/2 i-tabler-search text-muted-foreground" />
                  <TextField type="search" placeholder={t('documents.list.search.placeholder')} value={getSearchQuery()} onInput={event => setSearchQuery(event.currentTarget.value)} class="h-9 pl-9 pr-9" />
                </TextFieldRoot>
                <Show when={getSearchQuery().length > 0}><Button variant="ghost" size="icon" class="size-6 ml--8" onClick={() => setSearchQuery('')}><div class={cn('text-muted-foreground', activeQuery().isFetching ? 'i-tabler-loader-2 animate-spin' : 'i-tabler-x')} /></Button></Show>
              </div>
              <DocumentsPaginatedList documents={activeQuery().data?.documents ?? []} documentsCount={activeQuery().data?.documentsCount ?? 0} getPagination={getPagination} setPagination={setPagination} extraColumns={[tagsColumn, ...(getView() === 'all' ? [folderColumn] : []), createdAtColumn, standardActionsColumn]} />
            </Show>
          </Suspense>
        </Show>
      </div>
    </div>
  );
};
