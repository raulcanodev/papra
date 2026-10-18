import { createSignal, Show } from 'solid-js';
import { useI18n } from '@/modules/i18n/i18n.provider';
import { cn } from '@/modules/shared/style/cn';
import { Button } from '@/modules/ui/components/button';

// The quickest way in: invoices dropped here (or picked) are uploaded, read by the AI and opened for review
export function PurchaseDropZone(props: { onFiles: (files: File[]) => void; onPick: () => void; isUploading: boolean; compact?: boolean }) {
  const { t } = useI18n();
  const [isOver, setIsOver] = createSignal(false);
  // dragenter and dragleave fire for every child crossed: counted so the highlight does not flicker
  let depth = 0;

  const hasFiles = (event: DragEvent) => [...(event.dataTransfer?.types ?? [])].includes('Files');

  return (
    <div
      role="button"
      tabIndex={0}
      aria-label={t('purchases.drop.title')}
      data-testid="purchase-drop-zone"
      class={cn(
        'group flex cursor-pointer items-center gap-4 rounded-2xl border-2 border-dashed transition-colors',
        props.compact ? 'p-4' : 'flex-col justify-center p-8 text-center sm:p-10',
        isOver() ? 'border-primary bg-primary/6' : 'border-border hover:border-primary/50 hover:bg-muted/40',
      )}
      onClick={() => props.onPick()}
      onKeyDown={(event) => {
        if (event.key === 'Enter' || event.key === ' ') {
          event.preventDefault();
          props.onPick();
        }
      }}
      onDragEnter={(event) => {
        if (!hasFiles(event)) {
          return;
        }
        event.preventDefault();
        depth += 1;
        setIsOver(true);
      }}
      onDragOver={(event) => {
        if (hasFiles(event)) {
          event.preventDefault();
        }
      }}
      onDragLeave={() => {
        depth = Math.max(0, depth - 1);
        setIsOver(depth > 0);
      }}
      onDrop={(event) => {
        event.preventDefault();
        depth = 0;
        setIsOver(false);
        const files = [...(event.dataTransfer?.files ?? [])];
        if (files.length > 0) {
          props.onFiles(files);
        }
      }}
    >
      <span class={cn('flex shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary', props.compact ? 'size-10' : 'size-12')}>
        <Show when={props.isUploading} fallback={<div class="i-tabler-file-upload size-6" />}>
          <div class="i-tabler-loader-2 size-6 animate-spin" />
        </Show>
      </span>
      <div class={cn('min-w-0', props.compact && 'flex-1 text-left')}>
        <p class="font-medium">{props.isUploading ? t('purchases.drop.uploading') : t('purchases.drop.title')}</p>
        <p class="text-sm text-muted-foreground">{t('purchases.drop.description')}</p>
      </div>
      <Button
        size="sm"
        variant={props.compact ? 'outline' : 'default'}
        class="shrink-0 gap-1.5"
        isLoading={props.isUploading}
        onClick={(event: MouseEvent) => {
          event.stopPropagation();
          props.onPick();
        }}
      >
        <div class="i-tabler-upload size-4" />
        {t('purchases.drop.button')}
      </Button>
    </div>
  );
}
