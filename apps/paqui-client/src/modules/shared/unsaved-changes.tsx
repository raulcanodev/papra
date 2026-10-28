import type { BeforeLeaveEventArgs } from '@solidjs/router';
import { useBeforeLeave } from '@solidjs/router';
import { createEffect, createSignal, onCleanup, onMount, Show, untrack } from 'solid-js';
import { useI18n } from '@/modules/i18n/i18n.provider';
import { Button } from '@/modules/ui/components/button';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/modules/ui/components/dialog';

type PendingLeave = { retry: () => void };

/**
 * Leaving an editor with changes asks first: keep editing, leave and discard, or save and go on to where the user was
 * going. Any way out is caught: the back arrow, a menu link, the back button of the browser (and closing the tab, with
 * the browser's own warning).
 *
 * What the screen fills by itself (a draft loaded from the server, the AI reading of a paper, the defaults of a new
 * one) is not a change: until the user touches the page the baseline follows the form, and a page that loads something
 * later calls `resetBaseline`.
 */
type GuardSave = { label: string; canSave: () => boolean; run: () => Promise<unknown> };

export function useUnsavedChangesGuard(props: {
  /** Everything the user can edit, compared as JSON */
  snapshot: () => unknown;
}) {
  const { t } = useI18n();
  const serialize = () => JSON.stringify(props.snapshot());

  const [baseline, setBaseline] = createSignal(untrack(serialize));
  const [isTouched, setIsTouched] = createSignal(false);
  const [pendingLeave, setPendingLeave] = createSignal<PendingLeave | null>(null);
  const [isDialogOpen, setIsDialogOpen] = createSignal(false);
  const [save, setSave] = createSignal<GuardSave | undefined>();
  let isLeaveAllowed = false;

  // Before the user does anything, whatever the screen fills in is where it starts from
  createEffect(() => {
    const current = serialize();
    if (!isTouched()) {
      setBaseline(current);
    }
  });

  onMount(() => {
    const touch = (event: Event) => {
      if (event.isTrusted) {
        setIsTouched(true);
      }
    };
    const events = ['input', 'change', 'pointerdown', 'keydown'] as const;
    events.forEach(name => document.addEventListener(name, touch, true));
    onCleanup(() => events.forEach(name => document.removeEventListener(name, touch, true)));
  });

  const isDirty = () => isTouched() && serialize() !== baseline();

  // Closing or reloading the tab: only the browser can ask, with its own words
  createEffect(() => {
    if (!isDirty()) {
      return;
    }
    const warn = (event: BeforeUnloadEvent) => event.preventDefault();
    window.addEventListener('beforeunload', warn);
    onCleanup(() => window.removeEventListener('beforeunload', warn));
  });

  useBeforeLeave((event: BeforeLeaveEventArgs) => {
    if (isLeaveAllowed || event.defaultPrevented || !isDirty()) {
      return;
    }

    event.preventDefault();
    setPendingLeave({ retry: () => event.retry(true) });
    setIsDialogOpen(true);
  });

  const leave = () => {
    const pending = pendingLeave();
    setPendingLeave(null);
    isLeaveAllowed = true;
    pending?.retry();
  };

  // Staying forgets where the user was going: a later save goes where the page goes after a save
  const keepEditing = () => {
    setIsDialogOpen(false);
    setPendingLeave(null);
  };

  const markSaved = () => {
    setBaseline(serialize());
    setIsTouched(false);
  };

  return {
    isDirty,
    /** The save of the page, offered in the dialog when it can be done; it ends calling `afterSave` */
    setSave: (config: GuardSave) => setSave(() => config),
    /** After the page loads something by itself once the user may have touched it (a draft, a reading) */
    resetBaseline: markSaved,
    /** Saved without leaving */
    markSaved,
    /** Saved: goes on to where the user was going when asked, else where the page goes after a save */
    afterSave: (goOn: () => void) => {
      markSaved();
      if (pendingLeave()) {
        leave();
        return;
      }
      goOn();
    },
    /** Leaves without asking, for a page that discarded its content itself (deleted it) */
    allowLeave: () => {
      isLeaveAllowed = true;
    },
    elements: (
      <Dialog open={isDialogOpen()} onOpenChange={isOpen => !isOpen && keepEditing()}>
        <DialogContent class="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>{t('common.unsaved-changes.title')}</DialogTitle>
            <DialogDescription>{t('common.unsaved-changes.message')}</DialogDescription>
            <Show when={save() && !save()!.canSave()}>
              <p class="text-sm text-muted-foreground">{t('common.unsaved-changes.cannot-save')}</p>
            </Show>
          </DialogHeader>
          <DialogFooter>
            {/* Stacked on a phone, wrapped rather than overflowing when the labels are long */}
            <div class="flex w-full min-w-0 flex-col-reverse gap-2 sm:(flex-row flex-wrap justify-end)">
              <Button size="sm" onClick={keepEditing}>{t('common.unsaved-changes.keep-editing')}</Button>
              <Button
                variant="ghost"
                size="sm"
                class="text-red-600 hover:text-red-600"
                onClick={() => {
                  setIsDialogOpen(false);
                  leave();
                }}
              >
                {t('common.unsaved-changes.discard')}
              </Button>
              <Show when={save()}>
                {getSave => (
                  <Button
                    size="sm"
                    disabled={!getSave().canSave()}
                    onClick={() => {
                      setIsDialogOpen(false);
                      // The page's save ends with afterSave, which goes on to where the user was going
                      getSave().run().catch(() => setPendingLeave(null));
                    }}
                  >
                    {getSave().label}
                  </Button>
                )}
              </Show>
            </div>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    ),
  };
}
