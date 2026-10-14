// Adapted from BoardUI stat cards delta pill, MIT licensed, see ./BOARDUI-LICENSE.txt
import { createMemo } from 'solid-js';
import { cn } from '@/modules/shared/style/cn';

export function getDelta({ current, previous }: { current: number; previous: number }) {
  if (previous === 0) {
    return { label: current === 0 ? '0%' : '—', direction: current === 0 ? 'flat' as const : 'up' as const };
  }

  const change = Math.round(((current - previous) / previous) * 1000) / 10;

  if (change === 0) {
    return { label: '0%', direction: 'flat' as const };
  }

  return { label: `${change > 0 ? '+' : ''}${change}%`, direction: change > 0 ? 'up' as const : 'down' as const };
}

/** Tinted pill with a direction glyph, green when the change is good news, red when bad */
export function DeltaPill(props: { current: number; previous: number; invert?: boolean }) {
  const delta = createMemo(() => getDelta({ current: props.current, previous: props.previous }));
  const isGood = () => (delta().direction === 'up') !== Boolean(props.invert);

  const styles = () => {
    if (delta().direction === 'flat') {
      return { icon: 'i-tabler-circle-minus', class: 'bg-muted text-muted-foreground' };
    }

    return {
      icon: delta().direction === 'up' ? 'i-tabler-circle-arrow-up-filled' : 'i-tabler-circle-arrow-down-filled',
      class: isGood() ? 'bg-emerald-500/12 text-emerald-700 dark:text-emerald-400' : 'bg-rose-500/12 text-rose-700 dark:text-rose-400',
    };
  };

  return (
    <span class={cn('flex shrink-0 items-center gap-1 rounded-full py-0.5 pe-2 ps-1 text-sm font-medium tabular-nums', styles().class)}>
      <div class={cn(styles().icon, 'size-4 shrink-0')} aria-hidden="true" />
      <span class="whitespace-nowrap">{delta().label}</span>
    </span>
  );
}
