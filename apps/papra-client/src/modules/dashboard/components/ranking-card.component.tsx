import { For, Show } from 'solid-js';
import { cn } from '@/modules/shared/style/cn';

export type RankingItem = {
  id: string;
  label: string;
  value: number;
  /** Part of the total, in basis points (2500 = 25%) */
  shareBps: number;
  detail?: string;
};

/** Ranked list with a proportional bar per row: who weighs most in a total */
export function RankingCard(props: {
  title: string;
  total: string;
  items: RankingItem[];
  format: (value: number) => string;
  formatShare: (shareBps: number) => string;
  emptyText: string;
  tone: 'blue' | 'violet' | 'emerald';
}) {
  const barTone = () => ({ blue: 'bg-blue-500/70', violet: 'bg-violet-500/70', emerald: 'bg-emerald-500/70' })[props.tone];

  return (
    <section class="flex min-w-0 flex-col gap-4 rounded-2xl border border-border/80 bg-card px-4 pt-4 pb-3">
      <div class="flex flex-col gap-0.5">
        <p class="text-sm font-medium text-muted-foreground">{props.title}</p>
        <p class="whitespace-nowrap text-2xl font-semibold tracking-tight tabular-nums">{props.total}</p>
      </div>

      <Show
        when={props.items.length > 0}
        fallback={<p class="flex flex-1 items-center justify-center rounded-xl border border-dashed py-10 text-center text-sm text-muted-foreground">{props.emptyText}</p>}
      >
        <ol class="flex flex-col gap-3">
          <For each={props.items}>
            {(item, index) => (
              <li class="flex flex-col gap-1.5">
                <div class="flex items-baseline justify-between gap-3 text-sm">
                  <span class="flex min-w-0 items-baseline gap-2">
                    <span class="w-4 shrink-0 text-xs text-muted-foreground tabular-nums">{index() + 1}</span>
                    <span class="truncate font-medium">{item.label}</span>
                    <Show when={item.detail}>{detail => <span class="truncate text-xs text-muted-foreground">{detail()}</span>}</Show>
                  </span>
                  <span class="flex shrink-0 items-baseline gap-2 tabular-nums">
                    <span class="font-medium">{props.format(item.value)}</span>
                    <span class="w-10 text-right text-xs text-muted-foreground">{props.formatShare(item.shareBps)}</span>
                  </span>
                </div>
                <div class="ml-6 h-1.5 overflow-hidden rounded-full bg-muted">
                  <div class={cn('h-full rounded-full transition-[width] duration-500', barTone())} style={{ width: `${Math.max(item.shareBps / 100, 1)}%` }} />
                </div>
              </li>
            )}
          </For>
        </ol>
      </Show>
    </section>
  );
}
