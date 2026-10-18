import type { JSX, ParentComponent } from 'solid-js';
import { Show } from 'solid-js';
import { cn } from '@/modules/shared/style/cn';

/** Stacks the sections of a workspace page or an editor, separated by hairlines instead of boxing each one in a card. */
export const PageSections: ParentComponent<{ class?: string }> = (props) => {
  return <div class={cn('flex flex-col divide-y', props.class)}>{props.children}</div>;
};

/** One section of a page: an optional heading (with actions on its right), then its content, straight on the page. */
export const PageSection: ParentComponent<{
  title?: JSX.Element;
  description?: JSX.Element;
  actions?: JSX.Element;
  class?: string;
}> = (props) => {
  return (
    <section class={cn('py-6 first:pt-0 last:pb-0', props.class)}>
      <Show when={props.title !== undefined || props.actions !== undefined}>
        <div class="mb-4 flex flex-wrap items-end justify-between gap-x-4 gap-y-2">
          <div class="min-w-0">
            <Show when={props.title}>
              <h2 class="text-[15px] font-semibold">{props.title}</h2>
            </Show>
            <Show when={props.description}>
              <p class="mt-0.5 text-sm text-muted-foreground">{props.description}</p>
            </Show>
          </div>
          {props.actions}
        </div>
      </Show>
      {props.children}
    </section>
  );
};
