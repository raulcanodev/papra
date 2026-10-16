import type { JSX, ParentComponent } from 'solid-js';
import { For, Show } from 'solid-js';
import { cn } from '@/modules/shared/style/cn';

/** A labelled input, with an optional hint under it. */
export const OnboardingField: ParentComponent<{ label: string; hint?: string; class?: string }> = (props) => {
  return (
    <label class={cn('grid gap-1.5 text-sm font-medium', props.class)}>
      <span>{props.label}</span>
      {props.children}
      <Show when={props.hint}>
        <span class="text-xs font-normal text-muted-foreground">{props.hint}</span>
      </Show>
    </label>
  );
};

export type ChoiceOption<T extends string> = { id: T; title: string; description?: string; icon?: string; preview?: JSX.Element };

/** One answer out of a few, shown as selectable cards. */
export function ChoiceCards<T extends string>(props: {
  options: readonly ChoiceOption<T>[];
  value: T;
  onChange: (value: T) => void;
  columns?: 2 | 3;
  disabled?: boolean;
}) {
  return (
    <div class={cn('grid auto-rows-fr gap-3', props.columns === 3 ? 'sm:grid-cols-3' : 'sm:grid-cols-2')}>
      <For each={props.options}>
        {(option) => {
          const selected = () => props.value === option.id;

          return (
            <button
              type="button"
              aria-pressed={selected()}
              disabled={props.disabled}
              onClick={() => props.onChange(option.id)}
              class={cn(
                'flex h-full flex-col rounded-xl border bg-card p-4 text-left transition-all hover:(border-primary/60 bg-primary/3) focus-visible:(outline-none ring-3 ring-ring/30)',
                selected() && 'border-primary bg-primary/5 ring-1 ring-primary',
              )}
            >
              <Show when={option.preview}>
                <div class="mb-3">{option.preview}</div>
              </Show>
              <div class={cn('flex gap-3', props.columns === 3 ? 'flex-col items-start gap-4' : 'items-start')}>
                <Show when={option.icon}>
                  <div class={cn('size-9 shrink-0 rounded-lg border bg-background flex items-center justify-center', selected() && 'border-primary/40 text-primary')}>
                    <div class={cn(option.icon, 'size-4.5')} />
                  </div>
                </Show>
                <div class="min-w-0">
                  <span class="block text-sm font-semibold">{option.title}</span>
                  <Show when={option.description}>
                    <span class="mt-1.5 block text-xs leading-relaxed text-muted-foreground text-pretty">{option.description}</span>
                  </Show>
                </div>
              </div>
            </button>
          );
        }}
      </For>
    </div>
  );
}

/** Small pill buttons for quick picks, e.g. payment terms. */
export function ChoiceChips<T extends string | number>(props: {
  options: readonly { id: T; label: string }[];
  value: T;
  onChange: (value: T) => void;
  disabled?: boolean;
}) {
  return (
    <div class="flex flex-wrap gap-2">
      <For each={props.options}>
        {option => (
          <button
            type="button"
            aria-pressed={props.value === option.id}
            disabled={props.disabled}
            onClick={() => props.onChange(option.id)}
            class={cn(
              'rounded-full border px-3 py-1 text-xs transition-colors hover:(border-primary/60 text-foreground)',
              props.value === option.id ? 'border-primary bg-primary/6 text-foreground' : 'text-muted-foreground',
            )}
          >
            {option.label}
          </button>
        )}
      </For>
    </div>
  );
}
