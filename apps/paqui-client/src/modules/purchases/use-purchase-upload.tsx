import { useNavigate } from '@solidjs/router';
import pLimit from 'p-limit';
import { createSignal } from 'solid-js';
import { uploadChatAttachment } from '@/modules/ai-assistant/ai-assistant.services';
import { createPhotoCapture } from '@/modules/captures/components/photo-capture-button';
import { useI18n } from '@/modules/i18n/i18n.provider';
import { createToast } from '@/modules/ui/components/sonner';
import { getOrganizationRouteChildHref } from '@/modules/ui/navigation/organization-navigation';
import { useLinkWithReturn } from '@/modules/ui/navigation/return-to';
import { EXTRACTABLE_FILE_ACCEPT } from './purchases.constants';
import { createPurchaseReadings } from './purchases.services';

// Purchases uploaded as files or photos, read by the AI and then reviewed one after the other in the editor.
// From a supplier's page the editor starts with that supplier chosen.
export function usePurchaseUpload(props: { organizationId: () => string; supplierId?: () => string | undefined }) {
  const { t } = useI18n();
  const navigate = useNavigate();
  const linkWithReturn = useLinkWithReturn();
  const [isUploading, setIsUploading] = createSignal(false);
  let fileInput: HTMLInputElement | undefined;

  // Queued for the AI as soon as each one is there: it reads in the background while the rest uploads
  const queueReadings = async (documentIds: string[]) => createPurchaseReadings({ organizationId: props.organizationId(), documentIds }).catch(() => {
    // The review screen queues it again if needed
  });

  // The documents are reviewed one after the other in the editor prefilled by the AI
  const reviewDocuments = (documentIds: string[]) => {
    const [first, ...queue] = documentIds;
    if (first === undefined) {
      return;
    }

    void queueReadings(documentIds);

    const search = new URLSearchParams({ documentId: first });
    if (queue.length > 0) {
      search.set('queue', queue.join(','));
    }
    const supplierId = props.supplierId?.();
    if (supplierId !== undefined) {
      search.set('supplierId', supplierId);
    }
    navigate(linkWithReturn(`${getOrganizationRouteChildHref({ organizationId: props.organizationId(), routeId: 'purchases', childPath: 'new' })}?${search.toString()}`));
  };

  // Files (or photos taken on this device) are uploaded as documents first, photos sent from the phone already are
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
      createToast({ type: 'error', message: t('purchases.upload.error') });
    } finally {
      setIsUploading(false);
    }
  };

  const photoCapture = createPhotoCapture({ organizationId: props.organizationId(), purpose: 'purchase', onFiles: files => void uploadFiles(files), onDocuments: reviewDocuments });

  // Typed by hand: the editor without a document
  const manualHref = () => {
    const supplierId = props.supplierId?.();
    const href = getOrganizationRouteChildHref({ organizationId: props.organizationId(), routeId: 'purchases', childPath: 'new' });
    return linkWithReturn(supplierId === undefined ? href : `${href}?supplierId=${encodeURIComponent(supplierId)}`);
  };

  return {
    uploadFiles,
    reviewDocuments,
    manualHref,
    openFilePicker: () => fileInput?.click(),
    openPhoto: () => photoCapture.open(),
    isBusy: () => isUploading() || photoCapture.isPreparing(),
    elements: (
      <>
        {photoCapture.elements}
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
      </>
    ),
  };
}
