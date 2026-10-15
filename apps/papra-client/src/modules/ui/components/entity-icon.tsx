import type { EntityIconColor } from './entity-icon.constants';
import { createMemo, createSignal, For, Show } from 'solid-js';
import { useI18n } from '@/modules/i18n/i18n.provider';
import { cn } from '@/modules/shared/style/cn';
import { Button } from './button';
import {
  ENTITY_EMOJI_GROUPS,
  ENTITY_ICON_COLOR_CLASSES,
  ENTITY_ICON_COLOR_I18N_KEYS,
  ENTITY_ICON_COLORS,
  ENTITY_ICON_PREFIX,
  ENTITY_ICONS,
  getEntityIconClass,
  getEntityIconColorClasses,
  isEntityIconName,
} from './entity-icon.constants';
import { Popover, PopoverContent, PopoverTrigger } from './popover';

export type EntityAppearance = { icon: string | null; iconColor: EntityIconColor | null };

const sizeClasses = {
  sm: { tile: 'size-6 rounded-md', icon: 'size-3.5', emoji: 'text-sm' },
  md: { tile: 'size-8 rounded-lg', icon: 'size-4', emoji: 'text-base' },
  lg: { tile: 'size-9 rounded-lg', icon: 'size-5', emoji: 'text-lg' },
};

/** The emoji or icon of an entity on its colored tile, the fallback icon class when it has none */
export function EntityIcon(props: { icon?: string | null; color?: string | null; fallback: string; size?: keyof typeof sizeClasses; class?: string }) {
  const size = () => sizeClasses[props.size ?? 'md'];
  const iconClass = () => getEntityIconClass(props.icon) ?? (props.icon && !isEntityIconName(props.icon) ? undefined : props.fallback);

  return (
    <span class={cn('flex shrink-0 select-none items-center justify-center leading-none', size().tile, getEntityIconColorClasses(props.color).tile, getEntityIconColorClasses(props.color).text, props.class)} aria-hidden="true">
      <Show when={iconClass()} fallback={<span class={size().emoji}>{props.icon}</span>}>
        {className => <div class={cn(className(), size().icon)} />}
      </Show>
    </span>
  );
}

// Accents and case do not matter when searching: "cafe" finds "café"
function normalize(text: string) {
  return text.normalize('NFD').replace(/\p{Diacritic}/gu, '').toLowerCase().trim();
}

/** Notion-like picker: an emoji or a curated icon, and one of a few tile colors. Its grid is only rendered while open. */
export function EntityIconPicker(props: { value: EntityAppearance; onChange: (value: EntityAppearance) => void; fallback: string; class?: string }) {
  const { t } = useI18n();
  const [tab, setTab] = createSignal<'emoji' | 'icon'>('emoji');
  const [search, setSearch] = createSignal('');
  let searchInput: HTMLInputElement | undefined;

  const term = () => normalize(search());
  const color = () => props.value.iconColor ?? 'gray';

  const emojiGroups = createMemo(() => {
    const query = term();

    if (query === '') {
      return ENTITY_EMOJI_GROUPS;
    }

    const emojis = ENTITY_EMOJI_GROUPS.flatMap(group => group.emojis).filter(([, keywords]) => normalize(keywords).includes(query));
    return [{ id: 'results', labelKey: null, emojis }];
  });

  const icons = createMemo(() => {
    const query = term();
    return query === '' ? ENTITY_ICONS : ENTITY_ICONS.filter(icon => normalize(icon.keywords).includes(query) || icon.name.includes(query));
  });

  const isEmpty = () => (tab() === 'emoji' ? emojiGroups().every(group => group.emojis.length === 0) : icons().length === 0);

  const select = (icon: string | null) => props.onChange({ ...props.value, icon });
  const selectColor = (iconColor: EntityIconColor) => props.onChange({ ...props.value, iconColor: iconColor === 'gray' ? null : iconColor });

  const cellClass = (selected: boolean) => cn(
    'flex size-8 items-center justify-center rounded-md transition-colors hover:bg-accent focus-visible:(outline-none ring-2 ring-ring/50)',
    selected && 'bg-accent ring-1 ring-border',
  );

  return (
    <Popover
      placement="bottom-start"
      onOpenChange={(open) => {
        // Opens on the tab of the current choice, with a fresh search
        setSearch('');
        if (open) {
          setTab(props.value.icon && isEntityIconName(props.value.icon) ? 'icon' : 'emoji');
        }
      }}
    >
      <PopoverTrigger
        type="button"
        class={cn('group relative shrink-0 rounded-lg transition-transform hover:scale-105 focus-visible:(outline-none ring-3 ring-ring/40)', props.class)}
        aria-label={t('entity-icon.change')}
        title={t('entity-icon.change')}
      >
        <EntityIcon icon={props.value.icon} color={props.value.iconColor} fallback={props.fallback} size="lg" class="border border-black/5 dark:border-white/10" />
        <span class="absolute -bottom-1 -right-1 flex size-4 items-center justify-center rounded-full border bg-background text-muted-foreground opacity-0 shadow-xs transition-opacity group-hover:opacity-100 group-focus-visible:opacity-100">
          <div class="i-tabler-pencil size-2.5" />
        </span>
      </PopoverTrigger>
      <PopoverContent
        class="w-[320px] p-0"
        onOpenAutoFocus={(event: Event) => {
          // Straight to the search, like Notion
          event.preventDefault();
          searchInput?.focus();
        }}
      >
        <div class="flex items-center justify-between gap-2 border-b px-2 pt-2">
          <div class="flex gap-1">
            <For each={[{ id: 'emoji' as const, label: t('entity-icon.tab.emoji') }, { id: 'icon' as const, label: t('entity-icon.tab.icons') }]}>
              {item => (
                <button
                  type="button"
                  class={cn('-mb-px border-b-2 px-2 pb-2 text-sm font-medium transition-colors', tab() === item.id ? 'border-foreground text-foreground' : 'border-transparent text-muted-foreground hover:text-foreground')}
                  onClick={() => setTab(item.id)}
                >
                  {item.label}
                </button>
              )}
            </For>
          </div>
          <Show when={props.value.icon || props.value.iconColor}>
            <Button type="button" variant="ghost" size="sm" class="mb-1.5 h-7 px-2 text-xs text-muted-foreground" onClick={() => props.onChange({ icon: null, iconColor: null })}>
              {t('entity-icon.remove')}
            </Button>
          </Show>
        </div>

        <div class="flex items-center gap-2 px-3 pt-3">
          <div class="relative flex-1">
            <div class="i-tabler-search pointer-events-none absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground" />
            <input
              ref={searchInput}
              value={search()}
              onInput={event => setSearch(event.currentTarget.value)}
              placeholder={t('entity-icon.search')}
              class="h-8 w-full rounded-md border border-input bg-field pl-8 pr-2 text-sm outline-none placeholder:text-muted-foreground focus-visible:(border-ring ring-3 ring-ring/30)"
            />
          </div>
        </div>

        <div class="h-60 overflow-y-auto px-2 py-2 [content-visibility:auto]">
          <Show when={!isEmpty()} fallback={<p class="py-10 text-center text-sm text-muted-foreground">{t('entity-icon.no-results')}</p>}>
            <Show
              when={tab() === 'emoji'}
              fallback={(
                <div class="grid grid-cols-8 gap-0.5">
                  <For each={icons()}>
                    {icon => (
                      <button type="button" class={cellClass(props.value.icon === `${ENTITY_ICON_PREFIX}${icon.name}`)} title={icon.name} onClick={() => select(`${ENTITY_ICON_PREFIX}${icon.name}`)}>
                        <div class={cn(icon.class, 'size-[18px]', ENTITY_ICON_COLOR_CLASSES[color()].text)} />
                      </button>
                    )}
                  </For>
                </div>
              )}
            >
              <For each={emojiGroups()}>
                {group => (
                  <Show when={group.emojis.length > 0}>
                    <Show when={group.labelKey}>
                      {labelKey => <div class="px-1 pb-1 pt-2 text-[11px] font-medium text-muted-foreground first:pt-0">{t(labelKey())}</div>}
                    </Show>
                    <div class="grid grid-cols-8 gap-0.5">
                      <For each={group.emojis}>
                        {([emoji, keywords]) => (
                          <button type="button" class={cn(cellClass(props.value.icon === emoji), 'text-xl leading-none')} title={keywords.split(' ')[0]} onClick={() => select(emoji)}>
                            {emoji}
                          </button>
                        )}
                      </For>
                    </div>
                  </Show>
                )}
              </For>
            </Show>
          </Show>
        </div>

        <div class="flex items-center justify-between gap-2 border-t px-3 py-2.5">
          <span class="text-xs font-medium text-muted-foreground">{t('entity-icon.color')}</span>
          <div class="flex items-center gap-1.5" role="radiogroup" aria-label={t('entity-icon.color')}>
            <For each={ENTITY_ICON_COLORS}>
              {item => (
                <button
                  type="button"
                  role="radio"
                  aria-checked={color() === item}
                  aria-label={t(ENTITY_ICON_COLOR_I18N_KEYS[item])}
                  title={t(ENTITY_ICON_COLOR_I18N_KEYS[item])}
                  class={cn(
                    'size-5 rounded-full ring-offset-2 ring-offset-popover transition-transform hover:scale-115 focus-visible:(outline-none ring-2 ring-ring)',
                    ENTITY_ICON_COLOR_CLASSES[item].swatch,
                    color() === item && 'ring-2 ring-foreground/70',
                  )}
                  onClick={() => selectColor(item)}
                />
              )}
            </For>
          </div>
        </div>
      </PopoverContent>
    </Popover>
  );
}
