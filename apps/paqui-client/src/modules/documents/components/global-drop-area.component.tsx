import type { Component } from 'solid-js';
import { createEffect, createSignal, onCleanup } from 'solid-js';
import { useI18n } from '@/modules/i18n/i18n.provider';
import { cn } from '@/modules/shared/style/cn';

type FilesDropHandler = { onFiles: (files: File[]) => void; description?: () => string };

// A page or an open dialog can take the files dropped on it for itself instead of the plain document upload (the
// purchases page reads them as invoices to pay, the price list import reads the spreadsheet). The last one registered
// wins, so an open dialog gets the files before the page under it
const [getFilesDropHandlers, setFilesDropHandlers] = createSignal<FilesDropHandler[]>([]);

function registerFilesDropHandler(handler: FilesDropHandler) {
  setFilesDropHandlers(handlers => [...handlers, handler]);

  return () => setFilesDropHandlers(handlers => handlers.filter(current => current !== handler));
}

export function usePageFilesDrop(onFiles: (files: File[]) => void, options: { description?: () => string } = {}) {
  onCleanup(registerFilesDropHandler({ onFiles, description: options.description }));
}

// Only while the condition holds, a dialog open on its file picking step for instance
export function useFilesDropWhile(when: () => boolean, onFiles: (files: File[]) => void, options: { description?: () => string } = {}) {
  createEffect(() => {
    if (when()) {
      onCleanup(registerFilesDropHandler({ onFiles, description: options.description }));
    }
  });
}

export const GlobalDropArea: Component<{ onFilesDrop?: (args: { files: File[] }) => void }> = (props) => {
  const { t } = useI18n();
  const [isDragging, setIsDragging] = createSignal(false);

  const handleDragOver = (e: DragEvent) => {
    e.preventDefault();
    setIsDragging(true);
  };

  const handleDragLeave = (e: DragEvent) => {
    if (e.relatedTarget === null) {
      setIsDragging(false);
    }
  };

  const handleDrop = (e: DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    const files = Array.from(e.dataTransfer?.files ?? []);

    if (files.length === 0) {
      return;
    }

    const handler = getFilesDropHandlers().at(-1);
    if (handler) {
      handler.onFiles(files);
      return;
    }

    props.onFilesDrop?.({ files });
  };

  // Adding global event listeners for drag and drop
  document.addEventListener('dragover', handleDragOver);
  document.addEventListener('dragleave', handleDragLeave);
  document.addEventListener('drop', handleDrop);

  // Cleanup listeners when component unmounts
  onCleanup(() => {
    document.removeEventListener('dragover', handleDragOver);
    document.removeEventListener('dragleave', handleDragLeave);
    document.removeEventListener('drop', handleDrop);
  });

  return (
    <div
      class={cn('fixed top-0 left-0 w-screen h-screen z-80 bg-background bg-opacity-50 backdrop-blur transition-colors', isDragging() ? 'block' : 'hidden')}
    >
      <div class="flex items-center justify-center h-full text-center flex-col">
        <div class="i-tabler-file-plus text-6xl text-muted-foreground mx-auto" />
        <div class="text-xl my-2 font-semibold text-muted-foreground">
          {t('documents.drop-area.title')}
        </div>
        <div class="text-base text-muted-foreground">
          {getFilesDropHandlers().at(-1)?.description?.() ?? t('documents.drop-area.description')}
        </div>
      </div>
    </div>
  );
};
