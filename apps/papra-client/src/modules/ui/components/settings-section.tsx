import type { JSX, ParentComponent } from 'solid-js';
import { Show } from 'solid-js';
import { cn } from '@/modules/shared/style/cn';

/** Stacks settings sections separated by hairlines instead of boxing each one in a card. */
export const SettingsSections: ParentComponent<{ class?: string }> = (props) => {
  return <div class={cn('divide-y border-t', props.class)}>{props.children}</div>;
};

/** One settings row: the title and description on the left, the fields on the right. */
export const SettingsSection: ParentComponent<{
  title: JSX.Element;
  description?: JSX.Element;
  aside?: JSX.Element;
  variant?: 'default' | 'destructive';
  class?: string;
}> = (props) => {
  return (
    <section class={cn('grid gap-4 py-6 md:grid-cols-[14rem_minmax(0,1fr)] md:gap-8', props.class)}>
      <div class="space-y-1">
        <div class="flex items-center gap-2">
          <h2 class={cn('text-sm font-medium', props.variant === 'destructive' && 'text-destructive')}>{props.title}</h2>
          {props.aside}
        </div>
        <Show when={props.description}>
          <p class="text-sm text-muted-foreground">{props.description}</p>
        </Show>
      </div>
      <div class="grid min-w-0 content-start gap-4">{props.children}</div>
    </section>
  );
};
