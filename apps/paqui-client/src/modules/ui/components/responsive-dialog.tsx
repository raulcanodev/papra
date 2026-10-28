import type { JSX } from 'solid-js';
import { createSignal, onCleanup, Show } from 'solid-js';
import { useI18n } from '@/modules/i18n/i18n.provider';
import { cn } from '@/modules/shared/style/cn';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from './dialog';
import { Sheet, SheetContent, SheetDescription, SheetTitle } from './sheet';

// Same breakpoint as the phone shell (bottom bar below md)
const DESKTOP_MEDIA_QUERY = '(min-width: 768px)';

function useIsDesktop() {
  const mediaQuery = window.matchMedia(DESKTOP_MEDIA_QUERY);
  const [isDesktop, setIsDesktop] = createSignal(mediaQuery.matches);
  const onChange = (event: MediaQueryListEvent) => setIsDesktop(event.matches);

  mediaQuery.addEventListener('change', onChange);
  onCleanup(() => mediaQuery.removeEventListener('change', onChange));

  return isDesktop;
}

/** A dialog on computers, a drawer from the bottom on phones (like the "+" of the bottom bar) */
export function ResponsiveDialog(props: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: JSX.Element;
  description?: JSX.Element;
  class?: string;
  children: JSX.Element;
}) {
  const { t } = useI18n();
  const isDesktop = useIsDesktop();

  return (
    <Show
      when={isDesktop()}
      fallback={(
        <Sheet open={props.open} onOpenChange={props.onOpenChange}>
          <SheetContent side="bottom" onDragClose={() => props.onOpenChange(false)} class="flex max-h-[92dvh] flex-col gap-0 rounded-t-3xl px-4 pt-2 pb-[calc(1rem+env(safe-area-inset-bottom))]">
            <div class="mx-auto mb-3 h-1.5 w-10 shrink-0 rounded-full bg-muted-foreground/30" aria-hidden="true" />

            <div class="mb-4 flex shrink-0 items-start justify-between gap-3">
              <div class="min-w-0">
                <SheetTitle class="text-xl font-bold">{props.title}</SheetTitle>
                <Show when={props.description}>
                  <SheetDescription class="mt-0.5">{props.description}</SheetDescription>
                </Show>
              </div>
              <button
                type="button"
                onClick={() => props.onOpenChange(false)}
                class="flex size-9 shrink-0 items-center justify-center rounded-full bg-muted text-muted-foreground"
                aria-label={t('ui.close')}
              >
                <div class="i-tabler-x size-4.5" />
              </button>
            </div>

            <div class="min-h-0 flex-1 overflow-y-auto">{props.children}</div>
          </SheetContent>
        </Sheet>
      )}
    >
      <Dialog open={props.open} onOpenChange={props.onOpenChange}>
        <DialogContent class={cn('max-h-[88vh] max-w-xl', props.class)}>
          <DialogHeader>
            <DialogTitle>{props.title}</DialogTitle>
            <Show when={props.description}>
              <DialogDescription>{props.description}</DialogDescription>
            </Show>
          </DialogHeader>
          {props.children}
        </DialogContent>
      </Dialog>
    </Show>
  );
}
