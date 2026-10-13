import type { Component } from 'solid-js';
import { makePersisted } from '@solid-primitives/storage';
import { createEffect, createSignal, For, onCleanup, Show } from 'solid-js';
import { Dynamic } from 'solid-js/web';
import { cn } from '@/modules/shared/style/cn';
import { DEV_TOOLS } from './dev-tools.registry';

type Corner = 'bottom-right' | 'bottom-left' | 'top-right' | 'top-left';

const CORNERS: Corner[] = ['top-left', 'top-right', 'bottom-left', 'bottom-right'];
const CORNER_CLASS: Record<Corner, string> = {
  'bottom-right': 'bottom-4 right-4',
  'bottom-left': 'bottom-4 left-4',
  'top-right': 'top-4 right-4',
  'top-left': 'top-4 left-4',
};
const HIDE_FOR_MS = 5 * 60 * 1000;
const DRAG_THRESHOLD = 4;

/** Floating toolbox for local development, like Vercel's toolbar. Only bundled when `import.meta.env.DEV`. */
export const DevTools: Component = () => {
  const [getCorner, setCorner] = makePersisted(createSignal<Corner>('bottom-right'), { name: 'papra_devtools_corner', storage: localStorage });
  const [getHiddenUntil, setHiddenUntil] = makePersisted(createSignal(0), { name: 'papra_devtools_hidden_until', storage: localStorage });
  const [isOpen, setIsOpen] = createSignal(false);
  const [dragPosition, setDragPosition] = createSignal<{ x: number; y: number } | null>(null);
  let drag: { startX: number; startY: number; moved: boolean } | null = null;

  const corner = () => (CORNERS.includes(getCorner()) ? getCorner() : 'bottom-right');
  const isHidden = () => getHiddenUntil() > Date.now();

  // Reappear once the hide period is over.
  createEffect(() => {
    const hiddenUntil = getHiddenUntil();
    if (!hiddenUntil) {
      return;
    }
    const timeout = setTimeout(() => setHiddenUntil(0), Math.max(0, hiddenUntil - Date.now()));
    onCleanup(() => clearTimeout(timeout));
  });

  const hide = () => {
    setIsOpen(false);
    setHiddenUntil(Date.now() + HIDE_FOR_MS);
  };

  const onPointerDown = (event: PointerEvent & { currentTarget: HTMLButtonElement }) => {
    event.currentTarget.setPointerCapture(event.pointerId);
    drag = { startX: event.clientX, startY: event.clientY, moved: false };
  };
  const onPointerMove = (event: PointerEvent) => {
    if (!drag) {
      return;
    }
    if (!drag.moved && Math.hypot(event.clientX - drag.startX, event.clientY - drag.startY) < DRAG_THRESHOLD) {
      return;
    }
    drag.moved = true;
    setIsOpen(false);
    setDragPosition({ x: event.clientX, y: event.clientY });
  };
  const onPointerUp = (event: PointerEvent) => {
    const state = drag;
    drag = null;
    setDragPosition(null);
    if (!state?.moved) {
      setIsOpen(open => !open);
      return;
    }
    const vertical = event.clientY < window.innerHeight / 2 ? 'top' : 'bottom';
    const horizontal = event.clientX < window.innerWidth / 2 ? 'left' : 'right';
    setCorner(`${vertical}-${horizontal}`);
  };

  return (
    <Show when={!isHidden()}>
      <div
        class={cn('fixed z-9999 text-sm font-400', !dragPosition() && CORNER_CLASS[corner()])}
        style={dragPosition() ? { left: `${dragPosition()!.x - 20}px`, top: `${dragPosition()!.y - 20}px` } : undefined}
      >
        <Show when={isOpen()}>
          <div
            class={cn(
              'absolute w-80 max-w-[calc(100vw-2rem)] max-h-[calc(100vh-6rem)] overflow-y-auto rounded-xl border bg-popover p-3 text-popover-foreground shadow-xl',
              corner().startsWith('top') ? 'top-12' : 'bottom-12',
              corner().endsWith('left') ? 'left-0' : 'right-0',
            )}
          >
            <div class="mb-3 flex items-center justify-between">
              <p class="text-sm font-semibold">Dev tools</p>
              <div class="flex items-center gap-1">
                <button type="button" onClick={hide} class="flex h-7 items-center gap-1 rounded-md px-2 text-xs text-muted-foreground hover:(bg-accent text-foreground)">
                  <div class="i-tabler-eye-off size-3.5" />
                  {' '}
                  Hide 5 min
                </button>
                <button type="button" aria-label="Close" onClick={() => setIsOpen(false)} class="flex size-7 items-center justify-center rounded-md text-muted-foreground hover:(bg-accent text-foreground)">
                  <div class="i-tabler-x size-4" />
                </button>
              </div>
            </div>

            <div class="divide-y">
              <For each={DEV_TOOLS}>
                {tool => (
                  <section class="grid min-w-0 gap-2 py-3 first:pt-0">
                    <h3 class="text-xs font-medium uppercase tracking-wide text-muted-foreground">{tool.title}</h3>
                    <Dynamic component={tool.component} />
                  </section>
                )}
              </For>
            </div>

            <div class="flex items-center justify-between border-t pt-3 text-xs text-muted-foreground">
              <span>Position</span>
              <div class="grid grid-cols-2 gap-1">
                <For each={CORNERS}>
                  {item => (
                    <button
                      type="button"
                      aria-label={`Move to ${item}`}
                      onClick={() => setCorner(item)}
                      class={cn('size-3 rounded-sm border', item === corner() ? 'border-foreground bg-foreground' : 'hover:bg-accent')}
                    />
                  )}
                </For>
              </div>
            </div>
          </div>
        </Show>

        <button
          type="button"
          aria-label="Dev tools"
          aria-expanded={isOpen()}
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={onPointerUp}
          class={cn(
            'flex size-10 touch-none select-none items-center justify-center rounded-full bg-foreground text-background shadow-lg transition-transform hover:scale-105',
            dragPosition() ? 'cursor-grabbing' : 'cursor-grab',
          )}
        >
          <div class="i-tabler-tool size-4.5" />
        </button>
      </div>
    </Show>
  );
};
