import { createMutation } from '@tanstack/solid-query';
import { createSignal, For, Show } from 'solid-js';
import { useI18n } from '@/modules/i18n/i18n.provider';
import { queryClient } from '@/modules/shared/query/query-client';
import { cn } from '@/modules/shared/style/cn';
import { Button } from '@/modules/ui/components/button';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/modules/ui/components/dialog';
import { createToast } from '@/modules/ui/components/sonner';
import { TextField } from '@/modules/ui/components/textfield';
import { adjustPriceMinor, formatMoney } from '../pricing.models';
import { adjustPriceListPrices, getPricingQueryKey } from '../pricing.services';

type Direction = 'increase' | 'decrease';

const PREVIEW_COUNT = 3;

// "5", "5,5" or "5 %" as hundredths of a percent; null when it is not a usable percentage
function parseRateBps(text: string) {
  const value = Number(text.trim().replace('%', '').replace(',', '.'));
  return text.trim() !== '' && Number.isFinite(value) && value > 0 ? Math.round(value * 100) : null;
}

/**
 * Raises or lowers every price of a price list by a percentage, always typed as a positive number: the direction is
 * picked with two buttons. Shows what a few prices become before applying, and applies (and records it) at once.
 */
export function AdjustPricesDialog(props: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  organizationId: string;
  priceListId: string;
  items: Array<{ productId: string; productName: string; priceMinor: number }>;
}) {
  const { t } = useI18n();
  const [direction, setDirection] = createSignal<Direction>('increase');
  const [rateText, setRateText] = createSignal('');

  const rateBps = () => parseRateBps(rateText());
  const isValid = () => rateBps() !== null && (direction() === 'increase' || rateBps()! < 10_000);
  const signedRateBps = () => (direction() === 'increase' ? 1 : -1) * (rateBps() ?? 0);

  const close = () => {
    setRateText('');
    setDirection('increase');
    props.onOpenChange(false);
  };

  const apply = createMutation(() => ({
    mutationFn: () => adjustPriceListPrices({ organizationId: props.organizationId, priceListId: props.priceListId, direction: direction(), rateBps: rateBps()! }),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: getPricingQueryKey({ organizationId: props.organizationId }) });
      createToast({ type: 'success', message: t(direction() === 'increase' ? 'pricing.adjust.toast.increased' : 'pricing.adjust.toast.decreased', { rate: rateText().trim().replace('%', '').trim() }) });
      close();
    },
    onError: () => createToast({ type: 'error', message: t('pricing.adjust.toast.error') }),
  }));

  const directionButton = (value: Direction, icon: string, label: string) => (
    <button
      type="button"
      class={cn('flex flex-1 items-center justify-center gap-1.5 rounded-md px-3 py-2 text-sm font-medium transition-colors', direction() === value ? 'bg-background shadow-sm' : 'text-muted-foreground hover:text-foreground')}
      aria-pressed={direction() === value}
      onClick={() => setDirection(value)}
    >
      <div class={cn(icon, 'size-4')} />
      {label}
    </button>
  );

  return (
    <Dialog open={props.open} onOpenChange={open => (open ? props.onOpenChange(true) : close())}>
      <DialogContent class="max-w-md">
        <DialogHeader>
          <DialogTitle>{t('pricing.adjust.title')}</DialogTitle>
          <DialogDescription>{t('pricing.adjust.description', { count: props.items.length })}</DialogDescription>
        </DialogHeader>

        <form
          class="space-y-4"
          onSubmit={(event) => {
            event.preventDefault();
            if (isValid()) {
              apply.mutate();
            }
          }}
        >
          <div class="flex gap-1 rounded-lg bg-muted p-1">
            {directionButton('increase', 'i-tabler-trending-up', t('pricing.adjust.increase'))}
            {directionButton('decrease', 'i-tabler-trending-down', t('pricing.adjust.decrease'))}
          </div>

          <label class="block text-sm font-medium">
            {t('pricing.adjust.rate')}
            <div class="relative mt-1.5">
              <TextField autofocus inputMode="decimal" placeholder="0" class="pr-8 text-right tabular-nums" value={rateText()} onInput={event => setRateText(event.currentTarget.value)} />
              <span class="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-sm text-muted-foreground">%</span>
            </div>
            <Show when={rateText().trim() !== '' && !isValid()}>
              <span class="mt-1 block text-xs text-destructive">{t('pricing.adjust.invalid')}</span>
            </Show>
          </label>

          <Show when={isValid()}>
            <div class="rounded-lg border bg-muted/30 p-3 text-sm">
              <div class="mb-2 text-xs font-medium text-muted-foreground">{t('pricing.adjust.preview')}</div>
              <For each={props.items.slice(0, PREVIEW_COUNT)}>
                {item => (
                  <div class="flex items-center justify-between gap-3 py-0.5">
                    <span class="truncate">{item.productName}</span>
                    <span class="shrink-0 tabular-nums">
                      <span class="text-muted-foreground">{formatMoney(item.priceMinor)}</span>
                      {' → '}
                      <span class="font-medium">{formatMoney(adjustPriceMinor({ priceMinor: item.priceMinor, rateBps: signedRateBps() }))}</span>
                    </span>
                  </div>
                )}
              </For>
              <Show when={props.items.length > PREVIEW_COUNT}>
                <div class="mt-1 text-xs text-muted-foreground">{t('pricing.adjust.preview-more', { count: props.items.length - PREVIEW_COUNT })}</div>
              </Show>
            </div>
          </Show>

          <DialogFooter>
            <Button type="button" variant="ghost" onClick={close}>{t('invoicing.common.cancel')}</Button>
            <Button type="submit" variant="primary" disabled={!isValid()} isLoading={apply.isPending}>{t('pricing.adjust.apply')}</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
