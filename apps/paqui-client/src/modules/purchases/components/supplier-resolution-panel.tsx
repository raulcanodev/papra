import type { PurchaseInvoiceExtraction } from '../purchases.types';
import { createSignal, For, Match, Show, Switch } from 'solid-js';
import { useI18n } from '@/modules/i18n/i18n.provider';
import { Button } from '@/modules/ui/components/button';
import { TextField } from '@/modules/ui/components/textfield';
import { ReviewNotice } from './review-notice';

type Counterparty = PurchaseInvoiceExtraction['counterparty'];

// What the AI found about who sent the paper, and the one action that settles it:
// a recognized supplier, a known contact to mark as supplier, an unknown company to create (or a similar contact to pick),
// or nothing readable, then the user types the name once the rest of the paper is read
export function SupplierResolutionPanel(props: {
  counterparty: Counterparty;
  // The supplier currently selected in the form
  selectedSupplierId: string;
  isPending: boolean;
  onCreate: (args: { name: string }) => void;
  onUseContact: (args: { contactId: string }) => void;
}) {
  const { t } = useI18n();
  const [typedName, setTypedName] = createSignal('');
  const details = () => [props.counterparty.taxId, props.counterparty.city].filter(Boolean).join(' · ');
  // Steps aside once the user picked another supplier by hand: the recognized one shows only while it is the selected one
  const isHidden = () => (props.counterparty.status === 'matched' && props.counterparty.hasSupplierRole
    ? props.selectedSupplierId !== props.counterparty.contactId
    : props.selectedSupplierId !== '');

  return (
    <Show when={!isHidden()}>
      <Switch>
        <Match when={props.counterparty.status === 'matched' && props.counterparty.hasSupplierRole}>
          <div class="flex items-start gap-2 text-sm">
            <div class="i-tabler-building-check mt-0.5 size-4 shrink-0 text-emerald-600" />
            <div class="min-w-0">
              <p class="font-medium">{t('purchases.editor.supplier.matched', { name: props.counterparty.name ?? '' })}</p>
              <Show when={props.counterparty.matchedBy === 'name'}>
                <p class="text-muted-foreground">{t('purchases.editor.supplier.matched-by-name')}</p>
              </Show>
            </div>
          </div>
        </Match>

        <Match when={props.counterparty.status === 'matched'}>
          <ReviewNotice
            tone="warning"
            icon="i-tabler-user-exclamation"
            title={t('purchases.editor.supplier.not-supplier', { name: props.counterparty.name ?? '' })}
            actions={(
              <Button size="sm" class="gap-1.5" isLoading={props.isPending} onClick={() => props.onUseContact({ contactId: props.counterparty.contactId! })}>
                <div class="i-tabler-user-check size-4" />
                {t('purchases.editor.supplier.add-role')}
              </Button>
            )}
          >
            <Show when={details()}>
              <p>{details()}</p>
            </Show>
            <p>{t('purchases.editor.supplier.needed-to-save')}</p>
          </ReviewNotice>
        </Match>

        <Match when={props.counterparty.status === 'create'}>
          <ReviewNotice
            tone="info"
            icon="i-tabler-building-plus"
            title={t('purchases.editor.supplier.unknown', { name: props.counterparty.name ?? props.counterparty.taxId ?? '' })}
            actions={(
              <Button size="sm" class="gap-1.5" isLoading={props.isPending} onClick={() => props.onCreate({ name: props.counterparty.name ?? props.counterparty.taxId ?? '' })}>
                <div class="i-tabler-user-plus size-4" />
                {t('purchases.editor.supplier.create')}
              </Button>
            )}
          >
            <Show when={details()}>
              <p class="tabular-nums">{details()}</p>
            </Show>
            <p>{t('purchases.editor.supplier.unknown-description')}</p>

            <Show when={props.counterparty.candidates.length > 0}>
              <div class="mt-3 border-t border-sky-500/20 pt-2">
                <p class="mb-1">{t('purchases.editor.supplier.candidates')}</p>
                <div class="divide-y divide-sky-500/15">
                  <For each={props.counterparty.candidates}>
                    {candidate => (
                      <div class="flex items-center gap-3 py-1.5">
                        <div class="min-w-0 flex-1 truncate text-foreground">
                          <span class="font-medium">{candidate.name}</span>
                          <Show when={candidate.taxId}>
                            <span class="text-muted-foreground">{` · ${candidate.taxId}`}</span>
                          </Show>
                        </div>
                        <Button size="sm" variant="outline" disabled={props.isPending} onClick={() => props.onUseContact({ contactId: candidate.contactId })}>
                          {t('purchases.editor.supplier.use')}
                        </Button>
                      </div>
                    )}
                  </For>
                </div>
              </div>
            </Show>
          </ReviewNotice>
        </Match>

        <Match when={props.counterparty.status === 'ask'}>
          <ReviewNotice tone="warning" icon="i-tabler-help-circle" title={t('purchases.editor.supplier.missing')}>
            <p>{t('purchases.editor.supplier.missing-description')}</p>
            <form
              class="mt-3 flex flex-col gap-2 sm:flex-row"
              onSubmit={(event) => {
                event.preventDefault();
                if (typedName().trim() !== '') {
                  props.onCreate({ name: typedName().trim() });
                }
              }}
            >
              <TextField class="flex-1" placeholder={t('purchases.editor.supplier.name-placeholder')} value={typedName()} onInput={event => setTypedName(event.currentTarget.value)} />
              <Button type="submit" size="sm" class="h-10 gap-1.5" disabled={typedName().trim() === ''} isLoading={props.isPending}>
                <div class="i-tabler-user-plus size-4" />
                {t('purchases.editor.supplier.create')}
              </Button>
            </form>
          </ReviewNotice>
        </Match>
      </Switch>
    </Show>
  );
}
