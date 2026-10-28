import { useNavigate } from '@solidjs/router';
import pLimit from 'p-limit';
import { createSignal } from 'solid-js';
import { uploadChatAttachment } from '@/modules/ai-assistant/ai-assistant.services';
import { useI18n } from '@/modules/i18n/i18n.provider';
import { EXTRACTABLE_FILE_ACCEPT } from '@/modules/purchases/purchases.constants';
import { createPurchaseReadings } from '@/modules/purchases/purchases.services';
import { createToast } from '@/modules/ui/components/sonner';
import { getOrganizationRouteChildHref } from '@/modules/ui/navigation/organization-navigation';
import { useLinkWithReturn } from '@/modules/ui/navigation/return-to';

// Invoices the organization issued before (or outside) the app, uploaded from the sales page: read by the AI like any
// invoice (the reading tells who issued it) and then reviewed one after the other on the import screen
export function useSalesImportUpload(props: { organizationId: () => string }) {
  const { t } = useI18n();
  const navigate = useNavigate();
  const linkWithReturn = useLinkWithReturn();
  const [isUploading, setIsUploading] = createSignal(false);
  let fileInput: HTMLInputElement | undefined;

  const queueReadings = async (documentIds: string[]) => createPurchaseReadings({ organizationId: props.organizationId(), documentIds }).catch(() => {
    // The import screen queues it again if needed
  });

  const reviewDocuments = (documentIds: string[]) => {
    const [first, ...queue] = documentIds;
    if (first === undefined) {
      return;
    }

    const search = new URLSearchParams({ documentId: first });
    if (queue.length > 0) {
      search.set('queue', queue.join(','));
    }
    navigate(linkWithReturn(`${getOrganizationRouteChildHref({ organizationId: props.organizationId(), routeId: 'invoices', childPath: 'import' })}?${search.toString()}`));
  };

  const uploadFiles = async (files: File[]) => {
    if (files.length === 0) {
      return;
    }

    setIsUploading(true);

    try {
      // A few at a time, in the order chosen; a file already uploaded gives back its document instead of failing
      const limit = pLimit(3);
      const documentIds = await Promise.all(files.map(async file => limit(async () => {
        const { attachment } = await uploadChatAttachment({ organizationId: props.organizationId(), file });
        void queueReadings([attachment.documentId]);
        return attachment.documentId;
      })));

      reviewDocuments([...new Set(documentIds)]);
    } catch {
      createToast({ type: 'error', message: t('invoicing.import.upload-error') });
    } finally {
      setIsUploading(false);
    }
  };

  return {
    uploadFiles,
    reviewDocuments,
    openFilePicker: () => fileInput?.click(),
    isBusy: isUploading,
    elements: (
      <input
        ref={fileInput}
        type="file"
        class="hidden"
        multiple
        accept={EXTRACTABLE_FILE_ACCEPT}
        onChange={(event) => {
          const files = [...(event.currentTarget.files ?? [])];
          event.currentTarget.value = '';
          void uploadFiles(files);
        }}
      />
    ),
  };
}
