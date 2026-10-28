import type { JSX } from 'solid-js';
import { A } from '@solidjs/router';
import { For, Show } from 'solid-js';
import { useI18n } from '@/modules/i18n/i18n.provider';
import { cn } from '@/modules/shared/style/cn';
import { useFullScreenOnMobile } from '../layouts/app-shell-context';
import { Button } from './button';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from './dropdown-menu';

export type EditorBarAction = {
  label: string;
  icon?: string;
  onSelect: () => void;
  isDestructive?: boolean;
  isLoading?: boolean;
  disabled?: boolean;
  /** Only in the ⋯ menu of a phone, when the page shows the action its own way on a computer */
  isMobileOnly?: boolean;
};

/**
 * The header of an editor (a purchase, an invoice, a delivery note): back, the title and the actions. On a phone the
 * editor takes the whole screen, the menus of the app step aside and this bar stays on top, so saving never needs a
 * scroll; the secondary actions fold into a ⋯ menu there.
 */
export function EditorBar(props: {
  backHref: string;
  backLabel: string;
  title: JSX.Element;
  /** Next to the title: a status, how many documents are left to review... */
  meta?: JSX.Element;
  /** The main actions (save), always visible */
  actions: JSX.Element;
  /** Buttons on a computer, a ⋯ menu on a phone (delete, skip...) */
  secondaryActions?: EditorBarAction[];
  class?: string;
}) {
  const { t } = useI18n();
  useFullScreenOnMobile();

  const getSecondaryActions = () => props.secondaryActions ?? [];

  return (
    <div
      class={cn(
        // Edge to edge on a phone, over the padding of the page
        'sticky top-0 z-30 -mx-4 -mt-6 mb-5 flex h-14 items-center gap-1 border-b border-border/80 bg-background/95 px-2 backdrop-blur-xl sm:(-mx-6 px-4)',
        'md:(static mx-0 mt-0 mb-6 h-auto gap-3 border-b-0 bg-transparent px-0 backdrop-blur-none)',
        props.class,
      )}
    >
      <Button as={A} href={props.backHref} variant="ghost" size="icon" class="shrink-0" aria-label={props.backLabel}>
        <div class="i-tabler-arrow-left size-5" />
      </Button>
      <h1 class="min-w-0 truncate text-base font-semibold md:text-xl">{props.title}</h1>
      <Show when={props.meta}>
        <div class="hidden shrink-0 sm:block">{props.meta}</div>
      </Show>

      <div class="ml-auto flex shrink-0 items-center gap-2">
        <For each={getSecondaryActions().filter(action => !action.isMobileOnly)}>
          {action => (
            <Button
              variant="ghost"
              class={cn('hidden gap-1.5 md:inline-flex', action.isDestructive && 'text-red-600')}
              disabled={action.disabled}
              isLoading={action.isLoading}
              onClick={() => action.onSelect()}
            >
              {action.label}
            </Button>
          )}
        </For>

        <Show when={getSecondaryActions().length > 0}>
          <DropdownMenu>
            <DropdownMenuTrigger as={Button} variant="ghost" size="icon" class="text-muted-foreground md:hidden" aria-label={t('layout.editor.more-actions')}>
              <div class="i-tabler-dots-vertical size-5" />
            </DropdownMenuTrigger>
            <DropdownMenuContent class="min-w-44">
              <For each={getSecondaryActions()}>
                {action => (
                  <DropdownMenuItem class={cn('gap-2', action.isDestructive && 'text-red-600')} disabled={action.disabled || action.isLoading} onSelect={() => action.onSelect()}>
                    <Show when={action.icon}>
                      <div class={cn(action.icon, 'size-4', !action.isDestructive && 'text-muted-foreground')} />
                    </Show>
                    {action.label}
                  </DropdownMenuItem>
                )}
              </For>
            </DropdownMenuContent>
          </DropdownMenu>
        </Show>

        {props.actions}
      </div>
    </div>
  );
}
