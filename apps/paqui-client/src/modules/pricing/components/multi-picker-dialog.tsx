import { createMemo, createSignal, For, Show } from 'solid-js';
import { useI18n } from '@/modules/i18n/i18n.provider';
import { Button } from '@/modules/ui/components/button';
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/modules/ui/components/dialog';
import { SimpleCheckbox } from '@/modules/ui/components/simple-checkbox';
import { TextField } from '@/modules/ui/components/textfield';

export type PickerItem = { id: string; label: string; detail?: string };

/** Picks several items of a long list (products, contacts...): a search, a "select all the visible ones" and checkboxes */
export function MultiPickerDialog(props: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  confirmLabel: string;
  items: PickerItem[];
  onConfirm: (ids: string[]) => void;
}) {
  const { t } = useI18n();
  const [search, setSearch] = createSignal('');
  const [selected, setSelected] = createSignal<Set<string>>(new Set());

  const visible = createMemo(() => {
    const query = search().trim().toLowerCase();
    return props.items.filter(item => `${item.label} ${item.detail ?? ''}`.toLowerCase().includes(query));
  });
  const allVisibleSelected = () => visible().length > 0 && visible().every(item => selected().has(item.id));

  const toggle = (id: string, checked: boolean) => setSelected((current) => {
    const next = new Set(current);
    checked ? next.add(id) : next.delete(id);
    return next;
  });

  const toggleVisible = (checked: boolean) => setSelected((current) => {
    const next = new Set(current);
    visible().forEach(item => (checked ? next.add(item.id) : next.delete(item.id)));
    return next;
  });

  const close = () => {
    setSearch('');
    setSelected(new Set<string>());
    props.onOpenChange(false);
  };

  return (
    <Dialog open={props.open} onOpenChange={open => (open ? props.onOpenChange(true) : close())}>
      <DialogContent class="max-w-lg">
        <DialogHeader><DialogTitle>{props.title}</DialogTitle></DialogHeader>
        <TextField placeholder={t('invoicing.common.search')} value={search()} onInput={event => setSearch(event.currentTarget.value)} />
        <Show when={props.items.length > 0} fallback={<div class="py-8 text-center text-sm text-muted-foreground">{t('pricing.picker.nothing-left')}</div>}>
          <div class="flex items-center justify-between border-b pb-2 text-sm">
            <SimpleCheckbox checked={allVisibleSelected()} onChange={toggleVisible} label={t('pricing.picker.select-visible', { count: visible().length })} />
            <span class="text-muted-foreground">{t('pricing.picker.selected', { count: selected().size })}</span>
          </div>
          <div class="max-h-80 overflow-y-auto">
            <For each={visible()}>
              {item => (
                <SimpleCheckbox
                  class="rounded-md px-1 py-1.5 hover:bg-muted/40"
                  checked={selected().has(item.id)}
                  onChange={checked => toggle(item.id, checked)}
                  label={(
                    <span>
                      {item.label}
                      <Show when={item.detail}>{detail => <span class="ml-2 text-xs text-muted-foreground">{detail()}</span>}</Show>
                    </span>
                  )}
                />
              )}
            </For>
          </div>
        </Show>
        <DialogFooter>
          <Button variant="ghost" onClick={close}>{t('invoicing.common.cancel')}</Button>
          <Button
            variant="primary"
            disabled={selected().size === 0}
            onClick={() => {
              props.onConfirm([...selected()]);
              close();
            }}
          >
            {props.confirmLabel}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
