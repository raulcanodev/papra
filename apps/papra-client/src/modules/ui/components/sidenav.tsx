import type { Component, ComponentProps, JSX } from 'solid-js';
import { A } from '@solidjs/router';
import { createSignal, For, Show } from 'solid-js';
import { cn } from '@/modules/shared/style/cn';
import { Button } from './button';

export type SideNavSubMenuItem = {
  label: string;
  icon: string;
  href?: string;
  onClick?: () => void;
  badge?: JSX.Element;
};

export type SideNavMenuItem = {
  label: string;
  icon: string;
  href?: string;
  onClick?: () => void;
  badge?: JSX.Element;
  children?: SideNavSubMenuItem[];
};

const MenuItemButton: Component<SideNavMenuItem & { end?: boolean; indent?: boolean }> = (props) => {
  return (
    <Button
      class={cn('justify-start items-center gap-2 dark:text-muted-foreground truncate', props.indent && 'pl-8 h-8 text-sm')}
      variant="ghost"
      {...(props.onClick
        ? { onClick: props.onClick }
        : { as: A, href: props.href, activeClass: 'bg-accent/50! text-accent-foreground! truncate', end: props.end ?? true } as ComponentProps<typeof Button>)
      }
    >
      <div class={cn(props.icon, props.indent ? 'size-4' : 'size-5', 'text-muted-foreground opacity-50')} />
      <div>{props.label}</div>
      {props.badge && <div class="ml-auto">{props.badge}</div>}
    </Button>
  );
};

const MenuItemGroup: Component<SideNavMenuItem> = (props) => {
  const [isOpen, setIsOpen] = createSignal(false);

  return (
    <div class="flex flex-col gap-0.5">
      <Button
        class="justify-start items-center gap-2 dark:text-muted-foreground truncate"
        variant="ghost"
        onClick={() => setIsOpen(v => !v)}
      >
        <div class={cn(props.icon, 'size-5 text-muted-foreground opacity-50')} />
        <div class="flex-1 text-left">{props.label}</div>
        <div class={cn('i-tabler-chevron-right size-4 text-muted-foreground opacity-50 transition-transform', isOpen() && 'rotate-90')} />
      </Button>
      <Show when={isOpen()}>
        <div class="flex flex-col gap-0.5">
          <For each={props.children}>
            {child => <MenuItemButton {...child} indent />}
          </For>
        </div>
      </Show>
    </div>
  );
};

export const SideNav: Component<{
  mainMenu?: SideNavMenuItem[];
  footerMenu?: SideNavMenuItem[];
  header?: Component;
  footer?: Component;
  preFooter?: Component;
}> = (props) => {
  return (
    <div class="flex h-full">
      {(props.header || props.mainMenu || props.footerMenu || props.footer || props.preFooter) && (
        <div class="h-full flex flex-col pb-6 flex-1 min-w-0">
          {props.header && <props.header />}

          {props.mainMenu && (
            <nav class="flex flex-col gap-0.5 mt-4 px-4">
              <For each={props.mainMenu}>
                {menuItem => (
                  <Show
                    when={menuItem.children && menuItem.children.length > 0}
                    fallback={<MenuItemButton {...menuItem} />}
                  >
                    <MenuItemGroup {...menuItem} />
                  </Show>
                )}
              </For>
            </nav>
          )}

          <div class="flex-1" />

          {props.preFooter && <props.preFooter />}

          {props.footerMenu && (
            <nav class="flex flex-col gap-0.5 px-4">
              <For each={props.footerMenu}>{menuItem => <MenuItemButton {...menuItem} />}</For>
            </nav>
          )}

          {props.footer && <props.footer />}
        </div>
      )}
    </div>
  );
};
