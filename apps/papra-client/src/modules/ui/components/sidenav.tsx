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
  /** Stable id, needed for the entries the member can hide */
  id?: string;
  /** Hidden by the member: only listed while customizing the menu */
  isHidden?: boolean;
  canHide?: boolean;
  label: string;
  icon: string;
  href?: string;
  onClick?: () => void;
  badge?: JSX.Element;
  children?: SideNavSubMenuItem[];
  /** Highlighted only on its exact route (default), or on its sub routes too when false */
  end?: boolean;
};

export type SideNavMenuSection = {
  id: string;
  label?: string;
  items: SideNavMenuItem[];
};

// Lets the member choose which entries of the main menu they see
export type SideNavCustomization = {
  isEditing: boolean;
  onToggleEditing: () => void;
  onToggleItem: (args: { id: string; isHidden: boolean }) => void;
  labels: {
    customize: string;
    done: string;
    hide: (label: string) => string;
    show: (label: string) => string;
  };
};

const MenuItemButton: Component<SideNavMenuItem & { indent?: boolean }> = (props) => {
  return (
    <Button
      class={cn('group/item h-8 justify-start items-center gap-2 rounded-md px-2 text-sm font-normal text-sidebar-foreground/75 truncate hover:(bg-sidebar-accent text-sidebar-foreground)', props.indent && 'pl-8')}
      variant="ghost"
      {...(props.onClick
        ? { onClick: props.onClick }
        : { as: A, href: props.href, activeClass: 'bg-sidebar-accent! text-sidebar-foreground! font-medium! [&>.nav-icon]:text-sidebar-foreground!', end: props.end ?? true } as ComponentProps<typeof Button>)
      }
    >
      <div class={cn(props.icon, 'nav-icon size-4 shrink-0 text-muted-foreground transition-colors group-hover/item:text-sidebar-foreground')} />
      <div class="truncate">{props.label}</div>
      {props.badge && <div class="ml-auto">{props.badge}</div>}
    </Button>
  );
};

const MenuItemGroup: Component<SideNavMenuItem> = (props) => {
  const [isOpen, setIsOpen] = createSignal(false);

  return (
    <div class="flex flex-col gap-0.5">
      <Button
        class="h-8 justify-start items-center gap-2 px-2 text-sm font-normal text-sidebar-foreground/75 truncate hover:(bg-sidebar-accent text-sidebar-foreground)"
        variant="ghost"
        onClick={() => setIsOpen(v => !v)}
      >
        <div class={cn(props.icon, 'size-4 text-muted-foreground')} />
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

const CustomizableMenuItem: Component<{ item: SideNavMenuItem; customization: SideNavCustomization }> = (props) => {
  const canToggle = () => props.customization.isEditing && props.item.canHide === true && props.item.id !== undefined;

  return (
    <div class={cn('group/row relative flex flex-col', props.item.isHidden && 'opacity-45')}>
      <div class="flex min-w-0 flex-col">
        <Show when={props.item.children && props.item.children.length > 0} fallback={<MenuItemButton {...props.item} />}>
          <MenuItemGroup {...props.item} />
        </Show>
      </div>
      <Show when={canToggle()}>
        <button
          type="button"
          class="absolute right-1 top-1 flex size-6 items-center justify-center rounded text-muted-foreground transition-colors hover:(bg-sidebar-accent text-sidebar-foreground)"
          aria-label={props.item.isHidden ? props.customization.labels.show(props.item.label) : props.customization.labels.hide(props.item.label)}
          aria-pressed={!props.item.isHidden}
          onClick={() => props.customization.onToggleItem({ id: props.item.id!, isHidden: !props.item.isHidden })}
        >
          <div class={cn(props.item.isHidden ? 'i-tabler-eye-off' : 'i-tabler-eye', 'size-3.5')} />
        </button>
      </Show>
    </div>
  );
};

export const SideNav: Component<{
  mainMenu?: SideNavMenuItem[];
  mainSections?: SideNavMenuSection[];
  footerMenu?: SideNavMenuItem[];
  header?: Component;
  footer?: Component;
  preFooter?: Component;
  customization?: SideNavCustomization;
}> = (props) => {
  const getMainSections = (): SideNavMenuSection[] => props.mainSections ?? (props.mainMenu
    ? [{ id: 'main', items: props.mainMenu }]
    : []);

  return (
    <div class="flex h-full bg-sidebar text-sidebar-foreground">
      {(props.header || props.mainMenu || props.mainSections || props.footerMenu || props.footer || props.preFooter) && (
        <div class="h-full flex flex-col gap-2 p-2 flex-1 min-w-0">
          {props.header && <props.header />}

          {getMainSections().length > 0 && (
            <nav class="flex min-h-0 flex-col gap-5 pt-2 overflow-y-auto">
              <For each={getMainSections()}>
                {section => (
                  <div class="flex flex-col gap-0.5">
                    <Show when={section.label}>
                      {label => <p class="px-2 pb-1 text-xs font-medium text-muted-foreground/90">{label()}</p>}
                    </Show>
                    <For each={section.items}>
                      {menuItem => (
                        <Show
                          when={props.customization?.isEditing === true ? props.customization : undefined}
                          fallback={(
                            <Show
                              when={menuItem.children && menuItem.children.length > 0}
                              fallback={<MenuItemButton {...menuItem} />}
                            >
                              <MenuItemGroup {...menuItem} />
                            </Show>
                          )}
                        >
                          {customization => <CustomizableMenuItem item={menuItem} customization={customization()} />}
                        </Show>
                      )}
                    </For>
                  </div>
                )}
              </For>
            </nav>
          )}

          <Show when={props.customization}>
            {customization => (
              <button
                type="button"
                class={cn(
                  'mx-2 flex w-fit items-center gap-1.5 rounded px-1 py-0.5 text-xs transition-colors',
                  customization().isEditing ? 'font-medium text-foreground' : 'text-muted-foreground/70 hover:text-foreground',
                )}
                onClick={() => customization().onToggleEditing()}
              >
                <div class={cn(customization().isEditing ? 'i-tabler-check' : 'i-tabler-adjustments-horizontal', 'size-3.5')} />
                {customization().isEditing ? customization().labels.done : customization().labels.customize}
              </button>
            )}
          </Show>

          <div class="flex-1" />

          {props.preFooter && <props.preFooter />}

          {props.footerMenu && (
            <nav class="flex flex-col gap-0.5">
              <For each={props.footerMenu}>{menuItem => <MenuItemButton {...menuItem} />}</For>
            </nav>
          )}

          {props.footer && <props.footer />}
        </div>
      )}
    </div>
  );
};
