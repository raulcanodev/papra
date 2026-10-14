import type { JSX } from 'solid-js';
import { For, Show } from 'solid-js';
import { cn } from '@/modules/shared/style/cn';

export type TaxModelTone = 'blue' | 'purple' | 'orange' | 'pink' | 'emerald';

// Same tones as the dashboard tiles, one per model so it is recognizable at a glance
const TONES: Record<TaxModelTone, { surface: string; badge: string }> = {
  blue: { surface: 'from-blue-500/10', badge: 'bg-blue-500/12 text-blue-700 dark:text-blue-300' },
  purple: { surface: 'from-purple-500/10', badge: 'bg-purple-500/12 text-purple-700 dark:text-purple-300' },
  orange: { surface: 'from-orange-500/10', badge: 'bg-orange-500/12 text-orange-700 dark:text-orange-300' },
  pink: { surface: 'from-pink-500/10', badge: 'bg-pink-500/12 text-pink-700 dark:text-pink-300' },
  emerald: { surface: 'from-emerald-500/10', badge: 'bg-emerald-500/12 text-emerald-700 dark:text-emerald-300' },
};

/** One tax model of the quarter: its estimated result, how it is computed and when it is due */
export function TaxModelCard(props: {
  tone: TaxModelTone;
  model: string;
  title: string;
  description: string;
  result: string;
  resultCaption: string;
  rows: { label: string; value: string; strong?: boolean }[];
  deadline?: string;
  footer?: JSX.Element;
}) {
  return (
    <section class={cn('flex min-w-0 flex-col rounded-2xl border border-border/80 bg-card bg-gradient-to-b to-transparent p-4', TONES[props.tone].surface)}>
      <div class="flex items-start justify-between gap-3">
        <div class="min-w-0">
          <p class="font-medium">{props.title}</p>
          <p class="text-sm text-muted-foreground">{props.description}</p>
        </div>
        <span class={cn('shrink-0 rounded-full px-2 py-0.5 text-xs font-semibold tabular-nums', TONES[props.tone].badge)}>{props.model}</span>
      </div>

      <div class="mt-4">
        <p class="text-3xl font-semibold tracking-tight tabular-nums">{props.result}</p>
        <p class="text-sm text-muted-foreground">{props.resultCaption}</p>
      </div>

      <dl class="mt-4 grid grid-cols-[1fr_auto] gap-x-4 gap-y-1.5 border-t pt-3 text-sm">
        <For each={props.rows}>
          {row => (
            <>
              <dt class={cn('text-muted-foreground', row.strong && 'font-medium text-foreground')}>{row.label}</dt>
              <dd class={cn('text-right tabular-nums', row.strong && 'font-semibold')}>{row.value}</dd>
            </>
          )}
        </For>
      </dl>

      <Show when={props.deadline || props.footer}>
        <div class="mt-auto pt-4">
          <Show when={props.deadline}>
            <p class="flex items-center gap-1.5 text-xs text-muted-foreground">
              <div class="i-tabler-calendar-due size-4" />
              {props.deadline}
            </p>
          </Show>
          {props.footer}
        </div>
      </Show>
    </section>
  );
}
