import type { Accessor } from 'solid-js';
import { createEffect, createSignal, on, onCleanup } from 'solid-js';

const DURATION_MS = 600;

const prefersReducedMotion = () => typeof window !== 'undefined' && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches === true;

/** Animates a number from its previous value to the new one, as BoardUI headline figures do */
export function useCountUp(target: Accessor<number>): Accessor<number> {
  const [value, setValue] = createSignal(prefersReducedMotion() ? target() : 0);
  let frame: number | undefined;

  createEffect(on(target, (to) => {
    if (frame !== undefined) {
      cancelAnimationFrame(frame);
    }

    if (prefersReducedMotion()) {
      setValue(to);
      return;
    }

    const from = value();
    const start = performance.now();

    const step = (now: number) => {
      const progress = Math.min(1, (now - start) / DURATION_MS);
      const eased = 1 - (1 - progress) ** 3;
      setValue(from + (to - from) * eased);

      frame = progress < 1 ? requestAnimationFrame(step) : undefined;
    };

    frame = requestAnimationFrame(step);
  }));

  onCleanup(() => frame !== undefined && cancelAnimationFrame(frame));

  return value;
}
