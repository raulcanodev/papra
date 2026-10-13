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
import { Button } from '@/modules/ui/components/button';
import { Card, CardContent } from '@/modules/ui/components/card';
import { createToast } from '@/modules/ui/components/sonner';
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
  cell: data => <span class="hidden md:block text-sm text-muted-foreground">{data.row.original.folder?.name ?? '—'}</span>,
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
  const resetPage = () => setPagination(pagination => ({ ...pagination, pageIndex: 0 }));

  return (
    <div class="page">
      <div class="page-header">
        <div><h1 class="page-title">{t('documents.list.title')}</h1><p class="page-description">{t('documents.list.description')}</p></div>
        <Button size="sm" class="h-8 text-xs gap-1.5" onClick={promptImport}><div class="i-tabler-upload size-3.5" />{t('documents.list.import')}</Button>
      </div>
      <div>
        <div class="flex items-center justify-between gap-3 mb-5">
          <div class="inline-flex rounded-lg border bg-muted/40 p-1">
            <Button
              size="sm"
              variant={getView() === 'all' ? 'default' : 'ghost'}
              onClick={() => {
                setView('all');
                setFolderId('');
                resetPage();
              }}
            >{t('documents.list.view.all')}
            </Button>
            <Button
              size="sm"
              variant={getView() === 'folders' ? 'default' : 'ghost'}
              onClick={() => {
                setView('folders');
                resetPage();
              }}
            >{t('documents.list.view.folders')}
            </Button>
          </div>
          <Show when={getView() === 'folders' && getFolderId() === ''}>
            <form
              class="flex gap-2"
              onSubmit={(event) => {
                event.preventDefault();
                if (newFolderName().trim()) {
                  createFolderMutation.mutate();
                }
              }}
            >
              <TextField class="h-8 w-48" placeholder={t('documents.folders.new.placeholder')} value={newFolderName()} onInput={event => setNewFolderName(event.currentTarget.value)} />
              <Button size="sm" type="submit" disabled={createFolderMutation.isPending || !newFolderName().trim()}><div class="i-tabler-folder-plus size-4 mr-1" />{t('documents.folders.new.submit')}</Button>
            </form>
          </Show>
        </div>

        <Show when={getView() === 'folders' && getFolderId() === ''}>
          <Show when={(foldersQuery.data?.folders.length ?? 0) > 0} fallback={<div class="rounded-xl border border-dashed p-12 text-center text-muted-foreground">{t('documents.folders.empty')}</div>}>
            <div class="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              <For each={foldersQuery.data?.folders}>{folder => (
                <button
                  type="button"
                  class="text-left"
                  onClick={() => {
                    setFolderId(folder.id);
                    resetPage();
                  }}
                >
                  <Card class="hover:border-primary/50 hover:bg-muted/20 transition-colors"><CardContent class="p-4 flex items-center gap-3"><div class="i-tabler-folder text-primary size-7" /><div class="min-w-0"><div class="font-medium truncate">{folder.name}</div><div class="text-xs text-muted-foreground">{t('documents.folders.count', { count: folder.documentsCount })}{folder.kind === 'customer' ? t('documents.folders.customer') : ''}</div></div></CardContent></Card>
                </button>
              )}
              </For>
            </div>
          </Show>
        </Show>

        <Show when={getView() === 'all' || getFolderId() !== ''}>
          <Show when={getView() === 'folders'}><Button variant="ghost" size="sm" class="mb-3" onClick={() => setFolderId('')}><div class="i-tabler-arrow-left size-4 mr-1" />{t('documents.list.view.folders')}</Button></Show>
          <Suspense>
            <Show when={(activeQuery().data?.documents.length ?? 0) > 0 || debouncedSearchQuery().length > 0} fallback={getView() === 'all' ? <DocumentUploadArea /> : <div class="rounded-xl border border-dashed p-12 text-center text-muted-foreground">{t('documents.folders.folder-empty')}</div>}>
              <div class="flex items-center mb-4">
                <TextFieldRoot class="max-w-md flex-1"><TextField type="search" placeholder={t('documents.list.search.placeholder')} value={getSearchQuery()} onInput={event => setSearchQuery(event.currentTarget.value)} class="pr-9" /></TextFieldRoot>
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
