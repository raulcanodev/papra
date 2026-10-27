import type { EntityIconColor } from './entity-icon.constants';
import { createEffect, createMemo, createSignal, For, Match, Show, Switch } from 'solid-js';
import { useI18n } from '@/modules/i18n/i18n.provider';
import { cn } from '@/modules/shared/style/cn';
import { entityIconSet, loadEntityIconSet } from '../icons/entity-icon-set';
import {
  ENTITY_EMOJI_GROUPS,
  ENTITY_ICON_COLOR_CLASSES,
  ENTITY_ICON_COLOR_I18N_KEYS,
  ENTITY_ICON_COLORS,
  ENTITY_ICON_PREFIX,
  getEntityIconColorClasses,
  getEntityIconName,
  isEntityIconName,
  SUGGESTED_ENTITY_ICONS,
} from './entity-icon.constants';
import { Popover, PopoverContent, PopoverTrigger } from './popover';

export type EntityAppearance = { icon: string | null; iconColor: EntityIconColor | null };

const sizeClasses = {
  sm: { tile: 'size-6 rounded-md', icon: 'size-3.5', emoji: 'text-sm' },
  md: { tile: 'size-8 rounded-lg', icon: 'size-4', emoji: 'text-base' },
  lg: { tile: 'size-9 rounded-lg', icon: 'size-5', emoji: 'text-lg' },
};

/** An icon of the set, drawn inline from its path data */
function SetIcon(props: { body: string; class?: string }) {
  // The markup comes from the icon package at build time, never from users
  // eslint-disable-next-line solid/no-innerhtml
  return <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 256 256" fill="currentColor" class={props.class} innerHTML={props.body} />;
}

/** The emoji or icon of an entity on its colored tile, the fallback icon class when it has none */
export function EntityIcon(props: { icon?: string | null; color?: string | null; fallback: string; size?: keyof typeof sizeClasses; class?: string }) {
  const size = () => sizeClasses[props.size ?? 'md'];
  const iconName = () => getEntityIconName(props.icon);
  const isEmoji = () => Boolean(props.icon) && !iconName();

  createEffect(() => {
    if (iconName() && !entityIconSet()) {
      void loadEntityIconSet();
    }
  });

  return (
    <span class={cn('flex shrink-0 select-none items-center justify-center leading-none', size().tile, getEntityIconColorClasses(props.color).tile, getEntityIconColorClasses(props.color).text, props.class)} aria-hidden="true">
      <Switch fallback={<div class={cn(props.fallback, size().icon)} />}>
        <Match when={isEmoji()}>
          <span class={size().emoji}>{props.icon}</span>
        </Match>
        {/* Empty tile for the instant the set loads, so the fallback icon does not flash */}
        <Match when={iconName() && !entityIconSet()}>
          <span class={size().icon} />
        </Match>
        <Match when={entityIconSet()?.bodies.get(iconName() ?? '')}>
          {body => <SetIcon body={body()} class={size().icon} />}
        </Match>
      </Switch>
    </span>
  );
}

// Accents and case do not matter when searching: "cafe" finds "café"
function normalize(text: string) {
  return text.normalize('NFD').replace(/\p{Diacritic}/gu, '').toLowerCase().trim();
}

// Grids render a page of cells at a time and grow while scrolling: the whole set is ~1500 icons
const PAGE_SIZE = 128;

/** Notion-like picker: an emoji or an icon of the set, and one of a few tile colors. Its grid is only rendered while open. */
export function EntityIconPicker(props: { value: EntityAppearance; onChange: (value: EntityAppearance) => void; fallback: string; class?: string }) {
  const { t } = useI18n();
  const [tab, setTab] = createSignal<'emoji' | 'icon'>('emoji');
  const [search, setSearch] = createSignal('');
  const [limit, setLimit] = createSignal(PAGE_SIZE);
  let searchInput: HTMLInputElement | undefined;
  let grid: HTMLDivElement | undefined;

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

  // Keywords normalized once per set, not on every keystroke
  const searchableIcons = createMemo(() => {
    const set = entityIconSet();
    if (!set) {
      return [];
    }

    const suggested = new Set(SUGGESTED_ENTITY_ICONS);
    const entries = [
      ...SUGGESTED_ENTITY_ICONS.map(name => set.entries.find(entry => entry.name === name)).filter(entry => entry !== undefined),
      ...set.entries.filter(entry => !suggested.has(entry.name)),
    ];

    return entries.map(entry => ({ ...entry, nameWords: entry.name.split('-'), search: normalize(entry.keywords) }));
  });

  // Every word must match ("coche rojo" narrows), icons whose name starts with the first word come first
  const icons = createMemo(() => {
    const words = term().split(/\s+/).filter(Boolean);
    const all = searchableIcons();

    if (words.length === 0) {
      return all;
    }

    const matches = all.filter(icon => words.every(word => icon.search.includes(word)));
    const [first = ''] = words;
    return [...matches.filter(icon => icon.nameWords.some(word => word.startsWith(first))), ...matches.filter(icon => !icon.nameWords.some(word => word.startsWith(first)))];
  });

  const isLoadingIcons = () => tab() === 'icon' && !entityIconSet();
  const isEmpty = () => (tab() === 'emoji' ? emojiGroups().every(group => group.emojis.length === 0) : !isLoadingIcons() && icons().length === 0);

  const resetScroll = () => {
    setLimit(PAGE_SIZE);
    grid?.scrollTo({ top: 0 });
  };

  const select = (icon: string | null) => props.onChange({ ...props.value, icon });
  const selectColor = (iconColor: EntityIconColor) => props.onChange({ ...props.value, iconColor: iconColor === 'gray' ? null : iconColor });

  const cellClass = (selected: boolean) => cn(
    'flex aspect-square items-center justify-center rounded-lg transition-colors hover:bg-accent focus-visible:(outline-none ring-2 ring-ring/50)',
    selected && 'bg-accent',
  );

  return (
    <Popover
      placement="bottom-start"
      onOpenChange={(open) => {
        // Opens on the tab of the current choice, with a fresh search
        setSearch('');
        setLimit(PAGE_SIZE);
        if (open) {
          setTab(props.value.icon && isEntityIconName(props.value.icon) ? 'icon' : 'emoji');
          void loadEntityIconSet();
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
        class="w-[320px] overflow-hidden p-0"
        onOpenAutoFocus={(event: Event) => {
          // Straight to the search, like Notion
          event.preventDefault();
          searchInput?.focus();
        }}
      >
        <div class="flex items-center gap-2 border-b pl-3 pr-1.5">
          <div class="i-tabler-search size-4 shrink-0 text-muted-foreground" />
          <input
            ref={searchInput}
            type="search"
            value={search()}
            onInput={(event) => {
              setSearch(event.currentTarget.value);
              resetScroll();
            }}
            placeholder={tab() === 'icon' ? t('entity-icon.search.icons') : t('entity-icon.search.emoji')}
            aria-label={tab() === 'icon' ? t('entity-icon.search.icons') : t('entity-icon.search.emoji')}
            class="h-11 min-w-0 flex-1 bg-transparent text-sm outline-none placeholder:text-muted-foreground [&::-webkit-search-cancel-button]:hidden"
          />
          <div class="flex shrink-0 rounded-md bg-muted p-0.5" role="tablist">
            <For each={[{ id: 'emoji' as const, label: t('entity-icon.tab.emoji') }, { id: 'icon' as const, label: t('entity-icon.tab.icons') }]}>
              {item => (
                <button
                  type="button"
                  role="tab"
                  aria-selected={tab() === item.id}
                  class={cn('rounded px-2 py-0.5 text-xs font-medium transition-colors', tab() === item.id ? 'bg-background text-foreground shadow-xs' : 'text-muted-foreground hover:text-foreground')}
                  onClick={() => {
                    setTab(item.id);
                    resetScroll();
                    searchInput?.focus();
                  }}
                >
                  {item.label}
                </button>
              )}
            </For>
          </div>
        </div>

        <div
          ref={grid}
          class="h-64 overflow-y-auto overscroll-contain p-1.5"
          onScroll={(event) => {
            const element = event.currentTarget;
            if (element.scrollTop + element.clientHeight > element.scrollHeight - 200) {
              setLimit(current => current + PAGE_SIZE);
            }
          }}
        >
          <Show when={!isLoadingIcons()} fallback={<div class="flex h-full items-center justify-center"><div class="i-tabler-loader-2 size-4 animate-spin text-muted-foreground" /></div>}>
            <Show when={!isEmpty()} fallback={<p class="py-10 text-center text-sm text-muted-foreground">{t('entity-icon.no-results')}</p>}>
              <Show
                when={tab() === 'emoji'}
                fallback={(
                  <div class="grid grid-cols-8">
                    <For each={icons().slice(0, limit())}>
                      {icon => (
                        <button type="button" class={cellClass(props.value.icon === `${ENTITY_ICON_PREFIX}${icon.name}`)} title={icon.name} onClick={() => select(`${ENTITY_ICON_PREFIX}${icon.name}`)}>
                          <SetIcon body={icon.body} class={cn('size-5', ENTITY_ICON_COLOR_CLASSES[color()].text)} />
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
                        {labelKey => <div class="px-1.5 pb-1 pt-3 text-[11px] font-medium text-muted-foreground first:pt-1">{t(labelKey())}</div>}
                      </Show>
                      <div class="grid grid-cols-8">
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
          </Show>
        </div>

        <div class="flex items-center justify-between gap-2 border-t px-3 py-2">
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
                    'size-4 rounded-full ring-offset-2 ring-offset-popover transition-transform hover:scale-115 focus-visible:(outline-none ring-2 ring-ring)',
                    ENTITY_ICON_COLOR_CLASSES[item].swatch,
                    color() === item && 'ring-2 ring-foreground/70',
                  )}
                  onClick={() => selectColor(item)}
                />
              )}
            </For>
          </div>
          <Show when={props.value.icon || props.value.iconColor}>
            <button type="button" class="text-xs text-muted-foreground transition-colors hover:text-foreground" onClick={() => props.onChange({ icon: null, iconColor: null })}>
              {t('entity-icon.remove')}
            </button>
          </Show>
        </div>
      </PopoverContent>
    </Popover>
  );
}
