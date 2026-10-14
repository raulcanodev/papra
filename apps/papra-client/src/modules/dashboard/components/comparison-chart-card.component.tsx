// Adapted from BoardUI revenue / orders chart cards, MIT licensed, see ./BOARDUI-LICENSE.txt
// https://github.com/BoardUI/boardui/blob/main/components/application/dashboard/revenue-chart-card.tsx
// Drawn with plain SVG instead of recharts, so the app gets no chart dependency.
import type { MonthlyComparisonPoint } from '../dashboard.types';
import { createMemo, createSignal, createUniqueId, For, Show } from 'solid-js';
import { cn } from '@/modules/shared/style/cn';
import { useCountUp } from './count-up';
import { DeltaPill } from './delta-pill.component';

const WIDTH = 600;
const HEIGHT = 200;
const GRID_LINES = 3;

type Point = { x: number; y: number };

// Monotone cubic interpolation (same idea as d3 curveMonotoneX): smooth, and never overshoots below zero
function buildMonotonePath(points: Point[]) {
  if (points.length < 2) {
    return '';
  }

  const slopes = points.slice(0, -1).map((point, index) => (points[index + 1]!.y - point.y) / (points[index + 1]!.x - point.x));
  const tangents = points.map((_, index) => {
    if (index === 0) {
      return slopes[0]!;
    }
    if (index === points.length - 1) {
      return slopes[index - 1]!;
    }
    const [before, after] = [slopes[index - 1]!, slopes[index]!];
    return before * after <= 0 ? 0 : (before + after) / 2;
  });

  return points.reduce((path, point, index) => {
    if (index === 0) {
      return `M${point.x},${point.y}`;
    }
    const previous = points[index - 1]!;
    const dx = (point.x - previous.x) / 3;
    return `${path} C${previous.x + dx},${previous.y + tangents[index - 1]! * dx} ${point.x - dx},${point.y - tangents[index]! * dx} ${point.x},${point.y}`;
  }, '');
}

export function ComparisonChartCard(props: {
  kind: 'area' | 'bar';
  title: string;
  points: MonthlyComparisonPoint[];
  format: (value: number) => string;
  formatAxis: (value: number) => string;
  monthLabel: (month: number, style: 'short' | 'long') => string;
  legend: { current: string; previous: string };
  comparisonCaption: { total: string; month: string };
  /** Months of the year elapsed so far: the headline total compares them with the same months of the previous year */
  elapsedMonths?: number;
  class?: string;
}) {
  const [activeIndex, setActiveIndex] = createSignal<number | null>(null);
  const gradientId = `chart-gradient-${createUniqueId()}`;

  const totals = createMemo(() => props.points
    .filter(({ month }) => month <= (props.elapsedMonths ?? 12))
    .reduce((sum, { current, previous }) => ({ current: sum.current + current, previous: sum.previous + previous }), { current: 0, previous: 0 }));
  const activePoint = () => {
    const index = activeIndex();
    return index === null ? null : props.points[index] ?? null;
  };

  const headline = () => activePoint()?.current ?? totals().current;
  const comparison = () => activePoint()?.previous ?? totals().previous;
  const display = useCountUp(headline);

  const yMax = createMemo(() => Math.max(1, ...props.points.flatMap(({ current, previous }) => [current, previous])) * 1.1);
  const toY = (value: number) => HEIGHT - (value / yMax()) * HEIGHT;
  const step = () => WIDTH / props.points.length;
  // Points sit at the center of their month band, aligned with the month labels below
  const lineX = (index: number) => step() * index + step() / 2;

  // The current year line stops at the last elapsed month instead of dropping to zero for the months to come
  const elapsedPoints = () => props.points.filter(({ month }) => month <= (props.elapsedMonths ?? 12));
  const currentLine = createMemo(() => buildMonotonePath(elapsedPoints().map((point, index) => ({ x: lineX(index), y: toY(point.current) }))));
  const previousLine = createMemo(() => buildMonotonePath(props.points.map((point, index) => ({ x: lineX(index), y: toY(point.previous) }))));
  const currentArea = () => `${currentLine()} L${lineX(elapsedPoints().length - 1)},${HEIGHT} L${lineX(0)},${HEIGHT} Z`;

  const cursorX = () => {
    const index = activeIndex();
    if (index === null) {
      return null;
    }
    return lineX(index);
  };

  const moveActive = (offset: number) => {
    const index = activeIndex();
    setActiveIndex(index === null ? (offset > 0 ? 0 : props.points.length - 1) : Math.min(props.points.length - 1, Math.max(0, index + offset)));
  };

  return (
    <section class={cn('flex min-w-0 flex-col gap-6 rounded-2xl border border-border/80 bg-muted/40 px-4 pt-4 pb-3 dark:bg-muted/20', props.class)}>
      <div class="flex w-full flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div class="flex min-w-0 flex-col gap-0.5" aria-live="polite">
          <p class="text-sm font-medium text-muted-foreground">{activePoint() ? props.monthLabel(activePoint()!.month, 'long') : props.title}</p>
          <div class="flex items-center gap-2">
            <p class="whitespace-nowrap text-2xl font-semibold tracking-tight tabular-nums">{props.format(display())}</p>
            <DeltaPill current={headline()} previous={comparison()} />
          </div>
          <p class="text-xs font-medium text-muted-foreground/80 tabular-nums">
            {props.format(comparison())}
            {' '}
            {activePoint() ? props.comparisonCaption.month : props.comparisonCaption.total}
          </p>
        </div>
        <dl class="flex shrink-0 items-center gap-4 text-xs font-medium text-muted-foreground">
          <div class="flex items-center gap-1.5">
            <span class="size-2 rounded-full bg-primary" aria-hidden="true" />
            <dt>{props.legend.current}</dt>
          </div>
          <div class="flex items-center gap-1.5">
            <span class="size-2 rounded-full bg-muted-foreground/40" aria-hidden="true" />
            <dt>{props.legend.previous}</dt>
          </div>
        </dl>
      </div>

      <div class="flex min-h-0 flex-1 gap-2">
        {/* Y axis labels, laid out in HTML so the stretched SVG never distorts the text */}
        <div class="relative w-10 shrink-0 text-right text-[11px] text-muted-foreground tabular-nums" aria-hidden="true">
          <For each={Array.from({ length: GRID_LINES + 1 }, (_, index) => index)}>
            {index => (
              <span class="absolute right-0 -translate-y-1/2" style={{ top: `${(index / GRID_LINES) * 100}%` }}>
                {props.formatAxis(yMax() * (1 - index / GRID_LINES))}
              </span>
            )}
          </For>
        </div>

        <div class="flex min-w-0 flex-1 flex-col gap-2">
          <div
            class="relative h-48 w-full rounded-md outline-none focus-visible:ring-2 focus-visible:ring-ring"
            tabindex="0"
            role="img"
            aria-label={props.title}
            onPointerLeave={() => setActiveIndex(null)}
            onBlur={() => setActiveIndex(null)}
            onKeyDown={(event) => {
              if (event.key === 'ArrowRight' || event.key === 'ArrowLeft') {
                event.preventDefault();
                moveActive(event.key === 'ArrowRight' ? 1 : -1);
              }
            }}
          >
            <svg viewBox={`0 0 ${WIDTH} ${HEIGHT}`} preserveAspectRatio="none" class="absolute inset-0 size-full overflow-visible">
              <defs>
                <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stop-color="hsl(var(--primary))" stop-opacity="0.28" />
                  <stop offset="100%" stop-color="hsl(var(--primary))" stop-opacity="0" />
                </linearGradient>
              </defs>

              <For each={Array.from({ length: GRID_LINES + 1 }, (_, index) => index)}>
                {index => <line x1="0" x2={WIDTH} y1={(index / GRID_LINES) * HEIGHT} y2={(index / GRID_LINES) * HEIGHT} stroke="hsl(var(--border))" stroke-width="1" vector-effect="non-scaling-stroke" />}
              </For>

              <Show when={cursorX() !== null}>
                <line x1={cursorX()!} x2={cursorX()!} y1="0" y2={HEIGHT} stroke="hsl(var(--muted-foreground) / 0.5)" stroke-width="1" stroke-dasharray="4 4" vector-effect="non-scaling-stroke" />
              </Show>

              <Show
                when={props.kind === 'area'}
                fallback={(
                  <For each={props.points}>
                    {(point, index) => {
                      const barWidth = () => step() * 0.3;
                      const isDimmed = () => activeIndex() !== null && activeIndex() !== index();
                      return (
                        <g class="transition-opacity duration-150" opacity={isDimmed() ? 0.45 : 1}>
                          <rect x={step() * index() + step() / 2 - barWidth() - 1} y={toY(point.previous)} width={barWidth()} height={HEIGHT - toY(point.previous)} rx="3" fill="hsl(var(--muted-foreground) / 0.3)" />
                          <rect x={step() * index() + step() / 2 + 1} y={toY(point.current)} width={barWidth()} height={HEIGHT - toY(point.current)} rx="3" fill="hsl(var(--primary))" />
                        </g>
                      );
                    }}
                  </For>
                )}
              >
                <path d={previousLine()} fill="none" stroke="hsl(var(--muted-foreground) / 0.45)" stroke-width="2" stroke-dasharray="5 5" vector-effect="non-scaling-stroke" />
                <path d={currentArea()} fill={`url(#${gradientId})`} />
                <path d={currentLine()} fill="none" stroke="hsl(var(--primary))" stroke-width="2.5" vector-effect="non-scaling-stroke" />
              </Show>

              {/* Invisible hover bands, one per month */}
              <For each={props.points}>
                {(_, index) => <rect x={step() * index()} y="0" width={step()} height={HEIGHT} fill="transparent" onPointerEnter={() => setActiveIndex(index())} />}
              </For>
            </svg>

            {/* Active marker in HTML, a circle in the stretched SVG would render as an ellipse */}
            <Show when={props.kind === 'area' && activePoint()?.month !== undefined && activePoint()!.month <= (props.elapsedMonths ?? 12) && activePoint()}>
              {getPoint => (
                <span
                  class="pointer-events-none absolute size-2.5 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-card bg-primary ring-4 ring-primary/25"
                  style={{ left: `${(lineX(activeIndex()!) / WIDTH) * 100}%`, top: `${(toY(getPoint().current) / HEIGHT) * 100}%` }}
                />
              )}
            </Show>
          </div>

          <div class="grid text-center text-[11px] text-muted-foreground" style={{ 'grid-template-columns': `repeat(${props.points.length}, minmax(0, 1fr))` }} aria-hidden="true">
            <For each={props.points}>
              {(point, index) => (
                <span class={cn('whitespace-nowrap', index() % 2 === 1 && 'max-xl:invisible', activeIndex() === index() && 'font-medium text-foreground visible')}>
                  {props.monthLabel(point.month, 'short')}
                </span>
              )}
            </For>
          </div>
        </div>
      </div>
    </section>
  );
}
