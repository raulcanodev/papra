import type { JSX } from 'solid-js';
import { createMutation, useQuery } from '@tanstack/solid-query';
import { createEffect, createSignal, onCleanup, Show } from 'solid-js';
import { preparePhotoForUpload } from '@/modules/captures/captures.models';
import { PhotoCaptureButton } from '@/modules/captures/components/photo-capture-button';
import { fetchDocumentFile, uploadDocument } from '@/modules/documents/documents.services';
import { useI18n } from '@/modules/i18n/i18n.provider';
import { cn } from '@/modules/shared/style/cn';
import { Button } from '@/modules/ui/components/button';
import { createToast } from '@/modules/ui/components/sonner';

// The photo is a document of the organization: its file needs the session, so it is fetched and shown from a blob URL
function useDocumentImageUrl(args: () => { organizationId: string; documentId: string | null | undefined }) {
  const [url, setUrl] = createSignal<string>();

  const query = useQuery(() => ({
    queryKey: ['organizations', args().organizationId, 'documents', args().documentId, 'file'],
    queryFn: () => fetchDocumentFile({ organizationId: args().organizationId, documentId: args().documentId! }),
    enabled: Boolean(args().documentId),
    staleTime: Number.POSITIVE_INFINITY,
  }));

  createEffect(() => {
    const blob = args().documentId ? query.data : undefined;
    const objectUrl = blob ? URL.createObjectURL(blob) : undefined;
    setUrl(objectUrl);
    onCleanup(() => objectUrl && URL.revokeObjectURL(objectUrl));
  });

  return url;
}

// The product photo in a table row, or its icon when it has none
export function ProductThumbnail(props: { organizationId: string; imageDocumentId: string | null | undefined; fallback: JSX.Element; class?: string }) {
  const url = useDocumentImageUrl(() => ({ organizationId: props.organizationId, documentId: props.imageDocumentId }));

  return (
    <Show when={url()} fallback={props.fallback}>
      {getUrl => <img src={getUrl()} alt="" class={cn('size-8 shrink-0 rounded-md border object-cover', props.class)} />}
    </Show>
  );
}

// Take the photo (camera of the phone, or QR code from the computer), upload one, or remove it
export function ProductPhotoField(props: { organizationId: string; value: string | null; onChange: (imageDocumentId: string | null) => void }) {
  const { t } = useI18n();
  const url = useDocumentImageUrl(() => ({ organizationId: props.organizationId, documentId: props.value }));
  let fileInput: HTMLInputElement | undefined;

  const uploadMutation = createMutation(() => ({
    mutationFn: async (file: File) => uploadDocument({ organizationId: props.organizationId, file: await preparePhotoForUpload({ file }) }),
    onSuccess: ({ document }) => props.onChange(document.id),
    onError: () => createToast({ type: 'error', message: t('invoicing.products.form.photo.error') }),
  }));

  return (
    <div class="flex items-center gap-4 sm:col-span-2">
      <div class="flex size-20 shrink-0 items-center justify-center overflow-hidden rounded-xl border bg-muted/50">
        <Show when={url()} fallback={<div class={cn('size-7 text-muted-foreground/60', uploadMutation.isPending ? 'i-tabler-loader-2 animate-spin' : 'i-tabler-photo')} />}>
          {getUrl => <img src={getUrl()} alt={t('invoicing.products.form.photo')} class="size-full object-cover" />}
        </Show>
      </div>
      <div class="flex flex-col gap-2">
        <span class="text-sm font-medium">{t('invoicing.products.form.photo')}</span>
        <div class="flex flex-wrap gap-2">
          <PhotoCaptureButton
            organizationId={props.organizationId}
            purpose="product_image"
            variant="outline"
            size="sm"
            class="gap-1.5"
            isLoading={uploadMutation.isPending}
            onFiles={([file]) => file && uploadMutation.mutate(file)}
            onDocuments={([documentId]) => documentId && props.onChange(documentId)}
          >
            <div class="i-tabler-camera size-4" />
            {t('invoicing.products.form.photo.take')}
          </PhotoCaptureButton>
          <Button variant="ghost" size="sm" class="gap-1.5" disabled={uploadMutation.isPending} onClick={() => fileInput?.click()}>
            <div class="i-tabler-upload size-4" />
            {t('invoicing.products.form.photo.upload')}
          </Button>
          <Show when={props.value}>
            <Button variant="ghost" size="sm" class="gap-1.5 text-red-600" onClick={() => props.onChange(null)}>
              <div class="i-tabler-trash size-4" />
              {t('invoicing.products.form.photo.remove')}
            </Button>
          </Show>
        </div>
      </div>
      <input
        ref={fileInput}
        type="file"
        class="hidden"
        accept="image/jpeg,image/png,image/webp,image/heic"
        onChange={(event) => {
          const [file] = [...(event.currentTarget.files ?? [])];
          event.currentTarget.value = '';
          if (file) {
            uploadMutation.mutate(file);
          }
        }}
      />
    </div>
  );
}
