import type { JSX } from 'solid-js';
import { Show } from 'solid-js';
import { cn } from '@/modules/shared/style/cn';

const TONE_CLASSES = {
  info: { box: 'border-sky-500/30 bg-sky-500/8', icon: 'text-sky-600 dark:text-sky-300' },
  warning: { box: 'border-orange-500/30 bg-orange-500/8', icon: 'text-orange-600 dark:text-orange-300' },
  danger: { box: 'border-red-500/30 bg-red-500/8', icon: 'text-red-600 dark:text-red-300' },
} as const;

// A tinted callout of the purchase review: the text runs the whole width (a phone has no room for a column beside it)
// and the actions sit under it as real buttons, so it is clear what can be pressed
export function ReviewNotice(props: {
  tone: keyof typeof TONE_CLASSES;
  icon: string;
  title: JSX.Element;
  children?: JSX.Element;
  actions?: JSX.Element;
  class?: string;
  ref?: (element: HTMLDivElement) => void;
}) {
  return (
    <div ref={props.ref} role="status" class={cn('flex flex-col gap-3 rounded-lg border p-3 text-sm', TONE_CLASSES[props.tone].box, props.class)}>
      <div class="flex items-start gap-2.5">
        <div class={cn(props.icon, 'mt-0.5 size-4 shrink-0', TONE_CLASSES[props.tone].icon)} />
        <div class="min-w-0 flex-1 space-y-1">
          <p class="font-medium">{props.title}</p>
          <Show when={props.children}>
            <div class="text-muted-foreground">{props.children}</div>
          </Show>
        </div>
      </div>
      <Show when={props.actions}>
        <div class="flex flex-col gap-2 pl-6.5 sm:flex-row sm:flex-wrap [&>*]:w-full sm:[&>*]:w-auto">{props.actions}</div>
      </Show>
    </div>
  );
}
