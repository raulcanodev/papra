import type { InvoiceReadParty } from '../purchases.types';
import { Show } from 'solid-js';
import { useI18n } from '@/modules/i18n/i18n.provider';
import { cn } from '@/modules/shared/style/cn';

// Who issued the paper and who it is for, as read, with the side of the organization marked: the first thing to check
// before registering it as a sale or as an expense
export function InvoiceParties(props: { issuer: InvoiceReadParty; recipient: InvoiceReadParty; ownSide: 'issuer' | 'recipient' | null }) {
  const { t } = useI18n();

  const Party = (party: { label: string; value: InvoiceReadParty; isOwn: boolean }) => (
    <div class="min-w-0 flex-1">
      <p class="text-xs text-muted-foreground uppercase tracking-wide">{party.label}</p>
      <p class={cn('flex min-w-0 items-center gap-1.5 font-medium', party.isOwn && 'text-primary')}>
        <span class="truncate">{party.value.name || t('invoicing.parties.unknown')}</span>
        <Show when={party.isOwn}>
          <span class="shrink-0 rounded-full bg-primary/10 px-1.5 py-0.5 text-[11px] leading-none text-primary">{t('invoicing.parties.you')}</span>
        </Show>
      </p>
      <Show when={party.value.taxId}>
        <p class="truncate text-xs text-muted-foreground tabular-nums">{party.value.taxId}</p>
      </Show>
    </div>
  );

  return (
    <div class="flex items-center gap-3 text-sm">
      <Party label={t('invoicing.parties.issuer')} value={props.issuer} isOwn={props.ownSide === 'issuer'} />
      <div class="i-tabler-arrow-right size-4 shrink-0 text-muted-foreground" />
      <Party label={t('invoicing.parties.recipient')} value={props.recipient} isOwn={props.ownSide === 'recipient'} />
    </div>
  );
}
