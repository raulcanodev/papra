import type { Document } from './documents.types';
import { createSignal } from 'solid-js';
import { useI18n } from '../i18n/i18n.provider';
import { useConfirmModal } from '../shared/confirm';
import { queryClient } from '../shared/query/query-client';
import { createToast } from '../ui/components/sonner';
import { deleteDocument, restoreDocument } from './documents.services';

export function invalidateOrganizationDocumentsQuery({ organizationId }: { organizationId: string }) {
  return queryClient.invalidateQueries({
    queryKey: ['organizations', organizationId],
  });
}

export function useDeleteDocument() {
  const { confirm } = useConfirmModal();
  const { t, te } = useI18n();
  const getConfirmMessage = (documentName: string) => te('documents.delete.confirm.message', { name: <span class="font-bold">{documentName}</span> });

  return {
    async deleteDocument({ documentId, organizationId, documentName }: { documentId: string; organizationId: string; documentName: string }): Promise<{ hasDeleted: boolean }> {
      const isConfirmed = await confirm({
        title: t('documents.delete.confirm.title'),
        message: getConfirmMessage(documentName),
        confirmButton: {
          text: t('documents.delete.confirm.title'),
          variant: 'destructive',
        },
        cancelButton: {
          text: t('documents.delete.confirm.cancel'),
        },
      });

      if (!isConfirmed) {
        return { hasDeleted: false };
      }

      await deleteDocument({
        documentId,
        organizationId,
      });

      await invalidateOrganizationDocumentsQuery({ organizationId });
      createToast({ type: 'success', message: t('documents.delete.toast.deleted') });

      return { hasDeleted: true };
    },
  };
}

export function useRestoreDocument() {
  const { t } = useI18n();
  const [getIsRestoring, setIsRestoring] = createSignal(false);

  return {
    getIsRestoring,
    async restore({ document }: { document: Document }) {
      setIsRestoring(true);

      await restoreDocument({
        documentId: document.id,
        organizationId: document.organizationId,
      });

      await invalidateOrganizationDocumentsQuery({ organizationId: document.organizationId });

      createToast({ type: 'success', message: t('documents.restore.toast.restored') });
      setIsRestoring(false);
    },
  };
}
