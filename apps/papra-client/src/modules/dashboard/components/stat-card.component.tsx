// Adapted from BoardUI stat cards (footer variant), MIT licensed, see ./BOARDUI-LICENSE.txt
// https://github.com/BoardUI/boardui/blob/main/components/application/dashboard/stat-cards.tsx
import type { JSX } from 'solid-js';
import { Show } from 'solid-js';
import { cn } from '@/modules/shared/style/cn';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/modules/ui/components/tooltip';
import { useCountUp } from './count-up';
import { DeltaPill } from './delta-pill.component';

export type StatTone = 'blue' | 'orange' | 'purple' | 'pink' | 'emerald' | 'sky';

// Soft wash of the card tone over its surface, strongest at the top where the icon sits
const SURFACE_TONES: Record<StatTone, string> = {
  blue: 'from-blue-500/12 via-blue-500/4',
  orange: 'from-orange-500/12 via-orange-500/4',
  purple: 'from-purple-500/12 via-purple-500/4',
  pink: 'from-pink-500/12 via-pink-500/4',
  emerald: 'from-emerald-500/12 via-emerald-500/4',
  sky: 'from-sky-500/12 via-sky-500/4',
};

const TILE_TONES: Record<StatTone, string> = {
  blue: 'from-blue-500 to-blue-600',
  orange: 'from-orange-400 to-orange-500',
  purple: 'from-purple-500 to-purple-600',
  pink: 'from-pink-500 to-pink-600',
  emerald: 'from-emerald-500 to-emerald-600',
  sky: 'from-sky-400 to-sky-500',
};

/** KPI card: tinted icon tile, label, count-up value, and a footer band with a comparison caption and its delta */
export function StatCard(props: {
  icon: string;
  tone: StatTone;
  label: string;
  value: number;
  format: (value: number) => string;
  caption: string;
  /** Comparison shown as a delta pill in the footer band */
  delta?: {
    current: number;
    previous: number;
    /** When rising is bad news (overdue amounts, refunds...), the delta reads red on increase */
    invert?: boolean;
  };
  /** Replaces the delta pill when the metric has no comparison */
  badge?: JSX.Element;
  hint?: string;
  /** Replaces the label, e.g. to switch what the card measures (the label stays its accessible name) */
  labelControl?: JSX.Element;
}) {
  const display = useCountUp(() => props.value);

  return (
    <section class={cn('flex min-w-0 flex-col rounded-2xl border border-border/80 bg-card bg-gradient-to-b to-transparent p-2', SURFACE_TONES[props.tone])}>
      <div class="flex w-full items-start justify-between gap-2.5 p-2">
        <span class={cn('flex size-10 shrink-0 items-center justify-center rounded-xl bg-gradient-to-b shadow-sm', TILE_TONES[props.tone])}>
          <div class={cn(props.icon, 'size-5 text-white')} aria-hidden="true" />
        </span>
        <Show when={props.hint}>
          <Tooltip>
            <TooltipTrigger
              as="button"
              type="button"
              aria-label={props.hint}
              class="flex shrink-0 items-center justify-center rounded-full text-muted-foreground transition-colors hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              <div class="i-tabler-info-circle-filled size-5" aria-hidden="true" />
            </TooltipTrigger>
            <TooltipContent class="max-w-64">{props.hint}</TooltipContent>
          </Tooltip>
        </Show>
      </div>

      <div class="flex flex-col gap-0.5 px-2 pt-2.5 pb-3.5">
        <Show when={props.labelControl} fallback={<p class="truncate text-sm font-medium text-muted-foreground">{props.label}</p>}>
          {props.labelControl}
        </Show>
        <p class="whitespace-nowrap text-2xl font-semibold tracking-tight tabular-nums sm:text-[28px]">{props.format(display())}</p>
      </div>

      <div class="mt-auto flex w-full items-center justify-between gap-2 rounded-xl border border-border/60 bg-card py-1.5 pe-1.5 ps-2.5 shadow-[0_1px_2px_rgb(0_0_0/0.04)]">
        <p class="truncate text-sm text-muted-foreground">{props.caption}</p>
        <Show when={props.delta} fallback={props.badge}>
          {getDelta => <DeltaPill current={getDelta().current} previous={getDelta().previous} invert={getDelta().invert} />}
        </Show>
      </div>
    </section>
  );
}
