import type { PurchaseMetadataEntry } from '../purchases.types';
import { Index, Show } from 'solid-js';
import { useI18n } from '@/modules/i18n/i18n.provider';
import { Button } from '@/modules/ui/components/button';
import { TextField } from '@/modules/ui/components/textfield';

// The data read on the paper that has no field of its own, editable as label and value
export function PurchaseMetadataFields(props: { value: PurchaseMetadataEntry[]; onChange: (value: PurchaseMetadataEntry[]) => void }) {
  const { t } = useI18n();
  const update = (index: number, changes: Partial<PurchaseMetadataEntry>) => props.onChange(props.value.map((entry, entryIndex) => (entryIndex === index ? { ...entry, ...changes } : entry)));

  return (
    <section class="rounded-xl border bg-card p-4">
      <div class="mb-3 flex items-start justify-between gap-3">
        <div>
          <h2 class="font-medium">{t('purchases.editor.metadata')}</h2>
          <p class="text-sm text-muted-foreground">{t('purchases.editor.metadata.description')}</p>
        </div>
        <Button variant="outline" size="sm" class="shrink-0 gap-1.5" onClick={() => props.onChange([...props.value, { label: '', value: '' }])}>
          <div class="i-tabler-plus size-4" />
          {t('purchases.editor.metadata.add')}
        </Button>
      </div>

      <Show when={props.value.length > 0} fallback={<p class="text-sm text-muted-foreground">{t('purchases.editor.metadata.empty')}</p>}>
        <div class="flex flex-col gap-2">
          <Index each={props.value}>
            {(entry, index) => (
              <div class="grid grid-cols-[minmax(0,2fr)_minmax(0,3fr)_auto] items-center gap-2">
                <TextField aria-label={t('purchases.editor.metadata.label')} placeholder={t('purchases.editor.metadata.label')} value={entry().label} onInput={event => update(index, { label: event.currentTarget.value })} />
                <TextField aria-label={t('purchases.editor.metadata.value')} placeholder={t('purchases.editor.metadata.value')} value={entry().value} onInput={event => update(index, { value: event.currentTarget.value })} />
                <Button variant="ghost" size="icon" class="text-red-600" aria-label={t('purchases.editor.metadata.remove')} onClick={() => props.onChange(props.value.filter((_, entryIndex) => entryIndex !== index))}>
                  <div class="i-tabler-trash size-4" />
                </Button>
              </div>
            )}
          </Index>
        </div>
      </Show>
    </section>
  );
}
