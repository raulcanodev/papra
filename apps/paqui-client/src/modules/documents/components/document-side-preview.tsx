import type { Component } from 'solid-js';
import type { Document } from '../documents.types';
import { makePersisted } from '@solid-primitives/storage';
import { useQuery } from '@tanstack/solid-query';
import { createEffect, createSignal, For, Match, onCleanup, Show, Switch } from 'solid-js';
import { useI18n } from '@/modules/i18n/i18n.provider';
import { cn } from '@/modules/shared/style/cn';
import { SwitchControl, SwitchLabel, SwitchThumb, Switch as Toggle } from '@/modules/ui/components/switch';
import { fetchDocumentFile } from '../documents.services';
import { DocumentPreview } from './document-preview.component';

const IMAGE_MIME_TYPES = ['image/jpeg', 'image/png', 'image/gif', 'image/webp'];
// Pages are drawn this wide whatever the column: sharp enough to be magnified under the mouse
const RENDER_WIDTH_PX = 2_000;
const MAX_RENDERED_PAGES = 30;
const ZOOM = 2.5;

async function renderPdfPages({ data, onPage }: { data: ArrayBuffer; onPage: (url: string) => void }) {
  const { getDocument, GlobalWorkerOptions } = await import('pdfjs-dist');
  GlobalWorkerOptions.workerSrc = new URL('pdfjs-dist/build/pdf.worker.min.mjs', import.meta.url).toString();

  const pdf = await getDocument({ data }).promise;
  try {
    for (let pageNumber = 1; pageNumber <= Math.min(pdf.numPages, MAX_RENDERED_PAGES); pageNumber++) {
      const page = await pdf.getPage(pageNumber);
      const viewport = page.getViewport({ scale: RENDER_WIDTH_PX / page.getViewport({ scale: 1 }).width });
      const canvas = document.createElement('canvas');
      canvas.width = Math.floor(viewport.width);
      canvas.height = Math.floor(viewport.height);
      await page.render({ canvasContext: canvas.getContext('2d')!, viewport }).promise;
      const blob = await new Promise<Blob | null>(resolve => canvas.toBlob(resolve, 'image/png'));
      if (blob) {
        onPage(URL.createObjectURL(blob));
      }
      page.cleanup();
    }
  } finally {
    void pdf.destroy();
  }
}

// Only with a mouse: on a touch screen the page is pinched instead
const hasFinePointer = () => typeof window !== 'undefined' && window.matchMedia('(hover: hover) and (pointer: fine)').matches;

// When the magnifier is on, the part of the page under the pointer is shown magnified in place, like a shop's product photo
const MagnifiableImage: Component<{ src: string; alt: string; canMagnify: boolean }> = (props) => {
  const [position, setPosition] = createSignal<{ x: number; y: number } | null>(null);

  return (
    <div
      class={cn('relative overflow-hidden', props.canMagnify && 'cursor-zoom-in')}
      onMouseMove={(event) => {
        if (!props.canMagnify) {
          return;
        }
        const rect = event.currentTarget.getBoundingClientRect();
        setPosition({ x: ((event.clientX - rect.left) / rect.width) * 100, y: ((event.clientY - rect.top) / rect.height) * 100 });
      }}
      onMouseLeave={() => setPosition(null)}
    >
      <img src={props.src} alt={props.alt} class="block h-auto w-full" draggable={false} />
      <Show when={props.canMagnify && position()}>
        {getPosition => (
          <div
            class="pointer-events-none absolute inset-0 bg-white bg-no-repeat"
            style={{ 'background-image': `url("${props.src}")`, 'background-size': `${ZOOM * 100}%`, 'background-position': `${getPosition().x}% ${getPosition().y}%` }}
          />
        )}
      </Show>
    </div>
  );
};

/**
 * The paper next to a form that is filled from it: as tall as the document itself (no empty viewer around a short
 * invoice), page after page, and magnified under the mouse on a computer when the magnifier is turned on. Other kinds of files use the full preview.
 */
export const DocumentSidePreview: Component<{ document: Document }> = (props) => {
  const { t } = useI18n();
  const isPdf = () => props.document.mimeType === 'application/pdf';
  const isImage = () => IMAGE_MIME_TYPES.includes(props.document.mimeType);

  const fileQuery = useQuery(() => ({
    queryKey: ['organizations', props.document.organizationId, 'documents', props.document.id, 'file'],
    queryFn: () => fetchDocumentFile({ documentId: props.document.id, organizationId: props.document.organizationId }),
    enabled: isPdf() || isImage(),
  }));

  // Off by default, remembered once turned on
  const [isMagnifierOn, setIsMagnifierOn] = makePersisted(createSignal(false), { name: 'paqui_document_magnifier', storage: localStorage });

  const [pages, setPages] = createSignal<string[]>([]);
  const [hasFailed, setHasFailed] = createSignal(false);
  createEffect(() => {
    const blob = fileQuery.data;
    if (!blob) {
      return;
    }

    let isCancelled = false;
    const urls: string[] = [];
    const addPage = (url: string) => {
      urls.push(url);
      if (isCancelled) {
        URL.revokeObjectURL(url);
        return;
      }
      setPages(current => [...current, url]);
    };
    setPages([]);
    setHasFailed(false);

    if (isImage()) {
      addPage(URL.createObjectURL(blob));
    } else {
      void blob.arrayBuffer()
        .then(async data => renderPdfPages({ data, onPage: addPage }))
        .catch(() => !isCancelled && setHasFailed(true));
    }

    onCleanup(() => {
      isCancelled = true;
      urls.forEach(url => URL.revokeObjectURL(url));
    });
  });

  return (
    <Switch fallback={<DocumentPreview document={props.document} />}>
      <Match when={(isPdf() || isImage()) && !hasFailed()}>
        <Show
          when={pages().length > 0}
          fallback={(
            <div class="flex min-h-60 items-center justify-center text-sm text-muted-foreground">
              <div class="i-tabler-loader-2 size-5 animate-spin" aria-label={t('documents.preview.loading')} />
            </div>
          )}
        >
          <Show when={hasFinePointer()}>
            <div class="sticky top-0 z-10 flex justify-end border-b bg-card/95 px-3 py-2 backdrop-blur">
              <Toggle class="flex items-center gap-2" checked={isMagnifierOn()} onChange={setIsMagnifierOn}>
                <SwitchLabel class="text-xs text-muted-foreground">{t('documents.preview.magnifier')}</SwitchLabel>
                <SwitchControl><SwitchThumb /></SwitchControl>
              </Toggle>
            </div>
          </Show>
          <div class="divide-y">
            <For each={pages()}>{(url, index) => <MagnifiableImage src={url} alt={`${props.document.name} · ${index() + 1}`} canMagnify={isMagnifierOn()} />}</For>
          </div>
        </Show>
      </Match>
    </Switch>
  );
};
