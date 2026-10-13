import type { DropdownMenuSubTriggerProps } from '@kobalte/core/dropdown-menu';
import type { Component } from 'solid-js';
import type { Document } from '../documents.types';
import { A } from '@solidjs/router';
import { createMutation, useQuery } from '@tanstack/solid-query';
import { For, Show } from 'solid-js';
import { useI18n } from '@/modules/i18n/i18n.provider';
import { queryClient } from '@/modules/shared/query/query-client';
import { Button } from '@/modules/ui/components/button';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSub, DropdownMenuSubContent, DropdownMenuSubTrigger, DropdownMenuTrigger } from '@/modules/ui/components/dropdown-menu';
import { createToast } from '@/modules/ui/components/sonner';
import { getDocumentOpenWithApps } from '../document.models';
import { useDeleteDocument } from '../documents.composables';
import { fetchDocumentFolders, moveDocumentToFolder } from '../documents.services';
import { DocumentOpenWithDropdownItems } from './open-with.component';
import { useRenameDocumentDialog } from './rename-document-button.component';

export const DocumentManagementDropdown: Component<{ document: Document }> = (props) => {
  const { deleteDocument } = useDeleteDocument();
  const { openRenameDialog } = useRenameDocumentDialog();
  const { t } = useI18n();
  const foldersQuery = useQuery(() => ({ queryKey: ['organizations', props.document.organizationId, 'document-folders'], queryFn: () => fetchDocumentFolders({ organizationId: props.document.organizationId }) }));
  const moveMutation = createMutation(() => ({
    mutationFn: (folderId: string | null) => moveDocumentToFolder({ organizationId: props.document.organizationId, documentId: props.document.id, folderId }),
    onSuccess: async () => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['organizations', props.document.organizationId, 'documents'] }),
        queryClient.invalidateQueries({ queryKey: ['organizations', props.document.organizationId, 'document-folders'] }),
      ]);
      createToast({ type: 'success', message: t('documents.menu.toast.moved') });
    },
    onError: () => createToast({ type: 'error', message: t('documents.menu.toast.move-error') }),
  }));

  const deleteDoc = () => deleteDocument({
    documentId: props.document.id,
    organizationId: props.document.organizationId,
    documentName: props.document.name,
  });

  const getOpenWithApps = () => getDocumentOpenWithApps({ document: props.document });

  return (

    <DropdownMenu>
      <DropdownMenuTrigger
        as={(props: DropdownMenuSubTriggerProps) => (
          <Button variant="ghost" size="icon" {...props}>
            <div class="i-tabler-dots-vertical size-4" />
          </Button>
        )}
      />
      <DropdownMenuContent class="w-48">
        <DropdownMenuItem
          class="cursor-pointer "
          as={A}
          href={`/organizations/${props.document.organizationId}/documents/${props.document.id}`}
        >
          <div class="i-tabler-info-circle size-4 mr-2" />
          <span>{t('documents.menu.details')}</span>
        </DropdownMenuItem>

        <Show when={(foldersQuery.data?.folders.length ?? 0) > 0}>
          <DropdownMenuSub>
            <DropdownMenuSubTrigger class="cursor-pointer">
              <div class="i-tabler-folder-move size-4 mr-2" />
              <span>{t('documents.menu.move')}</span>
            </DropdownMenuSubTrigger>
            <DropdownMenuSubContent>
              <Show when={props.document.folder}>
                <DropdownMenuItem class="cursor-pointer" onClick={() => moveMutation.mutate(null)}>{t('documents.menu.no-folder')}</DropdownMenuItem>
              </Show>
              <For each={foldersQuery.data?.folders}>
                {folder => (
                  <DropdownMenuItem class="cursor-pointer" disabled={folder.id === props.document.folder?.id} onClick={() => moveMutation.mutate(folder.id)}>
                    <div class="i-tabler-folder size-4 mr-2" />
                    <span>{folder.name}</span>
                  </DropdownMenuItem>
                )}
              </For>
            </DropdownMenuSubContent>
          </DropdownMenuSub>
        </Show>

        <Show when={getOpenWithApps().length > 0}>
          <DropdownMenuSub>
            <DropdownMenuSubTrigger class="cursor-pointer">
              <div class="i-tabler-app-window size-4 mr-2" />
              <span>{t('documents.open-with.label')}</span>
            </DropdownMenuSubTrigger>
            <DropdownMenuSubContent>
              <DocumentOpenWithDropdownItems apps={getOpenWithApps()} />
            </DropdownMenuSubContent>
          </DropdownMenuSub>
        </Show>

        <DropdownMenuItem
          class="cursor-pointer"
          onClick={() => openRenameDialog({
            documentId: props.document.id,
            organizationId: props.document.organizationId,
            documentName: props.document.name,
          })}
        >
          <div class="i-tabler-pencil size-4 mr-2" />
          <span>{t('documents.menu.rename')}</span>
        </DropdownMenuItem>

        <DropdownMenuItem
          class="cursor-pointer text-red"
          onClick={() => deleteDoc()}
        >
          <div class="i-tabler-trash size-4 mr-2" />
          <span>{t('documents.menu.delete')}</span>
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>

  );
};
