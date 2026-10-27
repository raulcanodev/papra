import type { Component } from 'solid-js';
import type { CalendarEntry } from '../calendar.types';
import { A } from '@solidjs/router';
import { createMemo, For, Show } from 'solid-js';
import { useAiAssistantPanel } from '@/modules/ai-assistant/ai-assistant-panel.provider';
import { useI18n } from '@/modules/i18n/i18n.provider';
import { cn } from '@/modules/shared/style/cn';
import { ResponsiveDialog } from '@/modules/ui/components/responsive-dialog';
import { useLinkWithReturn } from '@/modules/ui/navigation/return-to';

type SectionId = 'tax' | 'due' | 'issued' | 'received';

const sectionOf: Record<Exclude<CalendarEntry['type'], 'holiday'>, SectionId> = {
  'tax-deadline': 'tax',
  'payment-due': 'due',
  'collection-due': 'due',
  'invoice-issued': 'issued',
  'invoice-created': 'issued',
  'purchase-received': 'received',
};
const sectionOrder: SectionId[] = ['tax', 'due', 'issued', 'received'];
const markers: Record<CalendarEntry['type'], string> = {
  'tax-deadline': 'bg-amber-500',
  'payment-due': 'bg-red-500',
  'collection-due': 'bg-sky-500',
  'invoice-issued': 'bg-emerald-500',
  'invoice-created': 'bg-slate-400',
  'purchase-received': 'bg-violet-500',
  'holiday': 'bg-rose-500',
};

// One day of the calendar read like the page of a newspaper: the date as masthead, the holiday as headline, then
// each kind of news in its own column, every item with its official sources and a way to ask Paqui about it
export const CalendarDayEdition: Component<{
  date: Date | undefined;
  entries: CalendarEntry[];
  onOpenChange: (open: boolean) => void;
  onMoveDay: (offset: number) => void;
}> = (props) => {
  const { t, getLocale } = useI18n();
  const assistantPanel = useAiAssistantPanel();
  const linkWithReturn = useLinkWithReturn();

  const longDate = () => props.date ? new Intl.DateTimeFormat(getLocale(), { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' }).format(props.date) : '';
  const weekday = () => props.date ? new Intl.DateTimeFormat(getLocale(), { weekday: 'long' }).format(props.date) : '';
  const monthYear = () => props.date ? new Intl.DateTimeFormat(getLocale(), { month: 'long', year: 'numeric' }).format(props.date) : '';
  const holidays = createMemo(() => props.entries.filter(entry => entry.type === 'holiday'));
  const sections = createMemo(() => sectionOrder
    .map(id => ({ id, entries: props.entries.filter(entry => entry.type !== 'holiday' && sectionOf[entry.type] === id) }))
    .filter(section => section.entries.length > 0));

  const promptFor = (entry: CalendarEntry) => {
    const date = longDate();
    if (entry.type === 'tax-deadline') {
      return t('calendar.day.ask.tax-deadline', { date, name: entry.title, details: (entry.details ?? []).join('; ') || entry.title });
    }
    if (entry.type === 'holiday') {
      return t('calendar.day.ask.holiday', { date, name: entry.title });
    }
    if (entry.type === 'payment-due' || entry.type === 'collection-due') {
      return t(`calendar.day.ask.${entry.type}`, { date, amount: entry.title, name: entry.subtitle ?? '' });
    }
    return t(`calendar.day.ask.${entry.type}`, { date, number: entry.title, name: entry.subtitle ?? '', amount: entry.amount ?? '' });
  };

  // The question is written before closing: it needs the date of the day
  const ask = (entry: CalendarEntry) => {
    const prompt = promptFor(entry);
    props.onOpenChange(false);
    assistantPanel.ask(prompt);
  };

  const AskButton: Component<{ entry: CalendarEntry }> = askProps => (
    <button type="button" class="inline-flex items-center gap-1.5 text-xs font-medium text-muted-foreground hover:text-foreground transition-colors" onClick={() => ask(askProps.entry)}>
      <img src="/logo.svg" alt="" class="size-3.5 [image-rendering:pixelated]" />
      {t('calendar.day.ask-paqui')}
    </button>
  );

  return (
    <ResponsiveDialog
      open={props.date !== undefined}
      onOpenChange={props.onOpenChange}
      class="max-w-lg"
      title={(
        <div class="flex items-end justify-between gap-4">
          <div class="min-w-0">
            <div class="text-[11px] font-medium uppercase tracking-[0.2em] text-muted-foreground">{weekday()}</div>
            <div class="mt-1 flex items-baseline gap-3">
              <span class="font-serif text-5xl font-semibold leading-none tabular-nums">{props.date?.getDate()}</span>
              <span class="font-serif text-lg font-normal capitalize text-muted-foreground">{monthYear()}</span>
            </div>
          </div>
          <div class="flex shrink-0 items-center gap-0.5 pb-1">
            <button type="button" class="flex size-8 items-center justify-center rounded-full text-muted-foreground hover:bg-accent hover:text-foreground" aria-label={t('calendar.day.previous')} onClick={() => props.onMoveDay(-1)}>
              <div class="i-tabler-chevron-left size-4" />
            </button>
            <button type="button" class="flex size-8 items-center justify-center rounded-full text-muted-foreground hover:bg-accent hover:text-foreground" aria-label={t('calendar.day.next')} onClick={() => props.onMoveDay(1)}>
              <div class="i-tabler-chevron-right size-4" />
            </button>
          </div>
        </div>
      )}
    >
      <div class="-mx-1 px-1 md:max-h-[64vh] md:overflow-y-auto">
        <div class="border-t-2 border-double border-foreground/70 pt-0.5"><div class="border-t border-foreground/20" /></div>

        <For each={holidays()}>
          {holiday => (
            <div class="flex items-start justify-between gap-4 border-b py-4">
              <div class="min-w-0">
                <div class="text-[11px] font-medium uppercase tracking-[0.16em] text-rose-600 dark:text-rose-400">{t('calendar.legend.holiday')}</div>
                <div class="mt-1 font-serif text-xl leading-snug">{holiday.title}</div>
                <Show when={holiday.source}><div class="mt-1 text-xs text-muted-foreground">{holiday.source}</div></Show>
              </div>
              <div class="shrink-0 pt-5"><AskButton entry={holiday} /></div>
            </div>
          )}
        </For>

        <Show
          when={sections().length > 0}
          fallback={(
            <Show when={holidays().length === 0}>
              <div class="py-10 text-center">
                <div class="font-serif text-lg">{t('calendar.day.empty.title')}</div>
                <p class="mt-1 text-sm text-muted-foreground">{t('calendar.day.empty.description')}</p>
              </div>
            </Show>
          )}
        >
          <For each={sections()}>
            {section => (
              <section class="pt-5">
                <h3 class="flex items-center gap-3 text-[11px] font-semibold uppercase tracking-[0.16em] text-muted-foreground">
                  {t(`calendar.day.section.${section.id}`)}
                  <span class="h-px flex-1 bg-border" />
                </h3>
                <div class="divide-y">
                  <For each={section.entries}>
                    {entry => (
                      <article class="py-3.5">
                        <div class="flex items-start gap-2.5">
                          <span class={cn('mt-1.5 size-1.5 shrink-0 rounded-full', markers[entry.type])} />
                          <div class="min-w-0 flex-1">
                            <div class="flex items-baseline justify-between gap-3">
                              <div class={cn('min-w-0 font-medium leading-snug', entry.isSettled && 'line-through opacity-60')}>
                                {entry.type === 'tax-deadline' && entry.details?.length ? entry.title.split(' · ')[0] : entry.title}
                                <Show when={entry.subtitle}><span class="ml-1.5 font-normal text-muted-foreground">{entry.subtitle}</span></Show>
                              </div>
                              <Show when={entry.amount}><span class="shrink-0 text-sm tabular-nums">{entry.amount}</span></Show>
                            </div>
                            <Show when={entry.type !== 'tax-deadline' && entry.source}>
                              <div class="mt-0.5 text-xs text-muted-foreground">{entry.source}</div>
                            </Show>
                            <Show when={entry.details?.length}>
                              <ul class="mt-1.5 space-y-1 text-sm leading-relaxed text-muted-foreground">
                                <For each={entry.details}>{detail => <li>{detail}</li>}</For>
                              </ul>
                            </Show>
                            <div class="mt-2.5 flex flex-wrap items-center gap-x-4 gap-y-1.5">
                              <Show when={entry.href}>
                                {getHref => (
                                  <A href={linkWithReturn(getHref())} class="inline-flex items-center gap-1 text-xs font-medium text-foreground hover:underline">
                                    {t('calendar.day.open')}
                                    <div class="i-tabler-arrow-right size-3.5" />
                                  </A>
                                )}
                              </Show>
                              <For each={entry.links}>
                                {link => (
                                  <a href={link.url} target="_blank" rel="noopener noreferrer" class="inline-flex items-center gap-1 text-xs font-medium text-primary hover:underline">
                                    {link.label}
                                    <div class="i-tabler-external-link size-3.5" />
                                  </a>
                                )}
                              </For>
                              <AskButton entry={entry} />
                            </div>
                          </div>
                        </div>
                      </article>
                    )}
                  </For>
                </div>
              </section>
            )}
          </For>
        </Show>

        <Show when={props.entries.some(entry => entry.type === 'tax-deadline')}>
          <p class="mt-4 border-t pt-3 text-xs text-muted-foreground">{t('calendar.day.tax-source')}</p>
        </Show>
      </div>
    </ResponsiveDialog>
  );
};
