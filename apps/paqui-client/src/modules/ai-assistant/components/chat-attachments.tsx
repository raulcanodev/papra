import type { ChatAttachment } from '../ai-assistant.services';
import { formatBytes } from '@corentinth/chisels';
import { createSignal, Show } from 'solid-js';
import { isTouchDevice, preparePhotoForUpload } from '@/modules/captures/captures.models';
import { CaptureQrDialog } from '@/modules/captures/components/capture-qr-dialog';
import { useI18n } from '@/modules/i18n/i18n.provider';
import { cn } from '@/modules/shared/style/cn';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/modules/ui/components/dropdown-menu';

// Anything the assistant can read: PDFs, spreadsheets, office files, photos and plain text
export const CHAT_ATTACHMENT_ACCEPT = [
  'application/pdf',
  'image/*',
  '.xlsx,.xlsm,.xls,.csv,.tsv,.ods',
  '.docx,.odt,.pptx,.odp,.rtf,.txt,.md,.json,.xml',
].join(',');

export const MAX_CHAT_ATTACHMENTS = 10;

// A file being attached: uploading, ready to send with the message, or failed (it is not sent)
export type PendingAttachment = {
  key: string;
  name: string;
  mimeType: string;
  size: number;
  status: 'uploading' | 'ready' | 'error';
  attachment?: ChatAttachment;
};

export function getAttachmentIcon({ mimeType, name }: { mimeType: string; name: string }) {
  const extension = /\.([a-z0-9]+)$/i.exec(name)?.[1]?.toLowerCase() ?? '';

  if (mimeType === 'application/pdf' || extension === 'pdf') {
    return { icon: 'i-tabler-file-type-pdf', color: 'text-red-600 bg-red-500/10' };
  }
  if (mimeType.includes('spreadsheet') || mimeType.includes('excel') || ['xlsx', 'xlsm', 'xls', 'csv', 'tsv', 'ods'].includes(extension)) {
    return { icon: 'i-tabler-file-spreadsheet', color: 'text-emerald-600 bg-emerald-500/10' };
  }
  if (mimeType.startsWith('image/')) {
    return { icon: 'i-tabler-photo', color: 'text-sky-600 bg-sky-500/10' };
  }
  if (mimeType.includes('word') || mimeType.includes('opendocument.text') || ['docx', 'odt', 'rtf'].includes(extension)) {
    return { icon: 'i-tabler-file-type-doc', color: 'text-blue-600 bg-blue-500/10' };
  }
  return { icon: 'i-tabler-file-text', color: 'text-muted-foreground bg-muted' };
}

// The badge of an attached file, above the input while composing and above the message once sent
export function AttachmentChip(props: { name: string; mimeType: string; size: number; status?: PendingAttachment['status']; onRemove?: () => void }) {
  const { t } = useI18n();
  const appearance = () => getAttachmentIcon({ mimeType: props.mimeType, name: props.name });

  return (
    <div
      class={cn('flex min-w-0 max-w-full sm:max-w-60 items-center gap-2 rounded-xl border bg-background py-1.5 pl-1.5 pr-2 text-xs shadow-xs', props.status === 'error' && 'border-red-500/40')}
      title={props.name}
    >
      <div class={cn('flex size-7 shrink-0 items-center justify-center rounded-lg', appearance().color)}>
        <div class={cn('size-4', props.status === 'uploading' ? 'i-tabler-loader-2 animate-spin' : appearance().icon)} />
      </div>
      <div class="min-w-0">
        <div class="truncate font-medium text-foreground">{props.name}</div>
        <div class={cn('text-[11px]', props.status === 'error' ? 'text-red-600' : 'text-muted-foreground')}>
          {props.status === 'error' ? t('ai-assistant.attachments.failed') : formatBytes({ bytes: props.size, base: 1000 })}
        </div>
      </div>
      <Show when={props.onRemove}>
        <button type="button" class="ml-0.5 flex size-9 sm:size-5 items-center justify-center shrink-0 rounded-full p-0.5 text-muted-foreground hover:bg-muted hover:text-foreground" aria-label={t('ai-assistant.attachments.remove')} onClick={() => props.onRemove?.()}>
          <div class="i-tabler-x size-3.5" />
        </button>
      </Show>
    </div>
  );
}

// The "+" of the input: attach files, or take a photo (the camera on a phone, a QR code for the phone on a computer)
export function ChatAttachMenu(props: { organizationId: string; disabled?: boolean; onFiles: (files: File[]) => void; onDocuments: (documentIds: string[]) => void }) {
  const { t } = useI18n();
  const [isQrOpen, setIsQrOpen] = createSignal(false);
  let fileInput: HTMLInputElement | undefined;
  let cameraInput: HTMLInputElement | undefined;

  const pick = ({ isPhoto }: { isPhoto: boolean }) => (event: Event & { currentTarget: HTMLInputElement }) => {
    const files = [...(event.currentTarget.files ?? [])];
    event.currentTarget.value = '';
    // A phone photo is large (sometimes HEIC): resized to a JPEG first
    if (isPhoto) {
      void Promise.all(files.map(async file => preparePhotoForUpload({ file }))).then(props.onFiles);
      return;
    }
    props.onFiles(files);
  };

  return (
    <>
      <DropdownMenu placement="top-start">
        <DropdownMenuTrigger
          disabled={props.disabled}
          aria-label={t('ai-assistant.attachments.menu')}
          class="flex size-11 sm:size-8 shrink-0 items-center justify-center rounded-full text-muted-foreground outline-none transition-colors hover:bg-muted hover:text-foreground disabled:opacity-50"
        >
          <div class="i-tabler-plus size-4.5" />
        </DropdownMenuTrigger>
        <DropdownMenuContent class="min-w-52">
          <DropdownMenuItem class="cursor-pointer gap-2" onSelect={() => fileInput?.click()}>
            <div class="i-tabler-paperclip size-4" />
            <div>
              <div>{t('ai-assistant.attachments.add-files')}</div>
              <div class="text-xs text-muted-foreground">{t('ai-assistant.attachments.add-files.hint')}</div>
            </div>
          </DropdownMenuItem>
          <DropdownMenuItem class="cursor-pointer gap-2" onSelect={() => (isTouchDevice() ? cameraInput?.click() : setIsQrOpen(true))}>
            <div class="i-tabler-camera size-4" />
            <div>
              <div>{t('ai-assistant.attachments.take-photo')}</div>
              <div class="text-xs text-muted-foreground">{isTouchDevice() ? t('ai-assistant.attachments.take-photo.hint-phone') : t('ai-assistant.attachments.take-photo.hint-desktop')}</div>
            </div>
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
      <input ref={fileInput} type="file" class="hidden" multiple accept={CHAT_ATTACHMENT_ACCEPT} onChange={pick({ isPhoto: false })} />
      <input ref={cameraInput} type="file" class="hidden" accept="image/*" capture="environment" onChange={pick({ isPhoto: true })} />
      <CaptureQrDialog open={isQrOpen()} onOpenChange={setIsQrOpen} organizationId={props.organizationId} purpose="purchase" onDocuments={props.onDocuments} />
    </>
  );
}
