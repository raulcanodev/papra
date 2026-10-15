import type { CapturePurpose } from '../captures.types';
import { createMutation, useQuery } from '@tanstack/solid-query';
import { createEffect, createSignal, Match, on, Show, Switch } from 'solid-js';
import { useI18n } from '@/modules/i18n/i18n.provider';
import { Button } from '@/modules/ui/components/button';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/modules/ui/components/dialog';
import { QrCode } from '@/modules/ui/components/qr-code';
import { getCaptureUrl, isUnreachableFromPhone } from '../captures.models';
import { completeCaptureSession, fetchCaptureSession, openCaptureSession } from '../captures.services';

const POLL_INTERVAL_MS = 2_000;

// The computer shows a QR code, the phone takes the photos, they show up here as documents of the organization
export function CaptureQrDialog(props: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  organizationId: string;
  purpose: CapturePurpose;
  onDocuments: (documentIds: string[]) => void;
}) {
  const { t } = useI18n();
  const [isDelivered, setIsDelivered] = createSignal(false);

  const openMutation = createMutation(() => ({
    mutationFn: () => openCaptureSession({ organizationId: props.organizationId, purpose: props.purpose }),
  }));

  // A new link each time the dialog opens: an old QR code photographed by someone else stops working
  createEffect(on(() => props.open, (open) => {
    if (open) {
      setIsDelivered(false);
      openMutation.mutate();
    }
  }));

  const captureSessionId = () => openMutation.data?.captureSession.id;
  const captureUrl = () => (openMutation.data ? getCaptureUrl({ token: openMutation.data.token }) : undefined);

  const sessionQuery = useQuery(() => ({
    queryKey: ['organizations', props.organizationId, 'captures', captureSessionId()],
    queryFn: () => fetchCaptureSession({ organizationId: props.organizationId, captureSessionId: captureSessionId()! }),
    enabled: props.open && captureSessionId() !== undefined && !isDelivered(),
    refetchInterval: POLL_INTERVAL_MS,
  }));

  const captureSession = () => sessionQuery.data?.captureSession ?? openMutation.data?.captureSession;
  const documentIds = () => captureSession()?.documentIds ?? [];

  const close = () => {
    const id = captureSessionId();
    if (id !== undefined && captureSession()?.status !== 'completed') {
      void completeCaptureSession({ organizationId: props.organizationId, captureSessionId: id }).catch(() => {});
    }
    props.onOpenChange(false);
  };

  const deliver = () => {
    if (isDelivered() || documentIds().length === 0) {
      return;
    }

    setIsDelivered(true);
    props.onDocuments(documentIds());
    close();
  };

  // The phone said it is done, or the single product photo arrived
  createEffect(() => {
    const session = captureSession();
    if (session && (session.status === 'completed' || (props.purpose === 'product_image' && session.documentIds.length > 0))) {
      deliver();
    }
  });

  return (
    <Dialog open={props.open} onOpenChange={open => (open ? props.onOpenChange(true) : close())}>
      <DialogContent class="max-w-md">
        <DialogHeader>
          <DialogTitle>{t('captures.dialog.title')}</DialogTitle>
          <DialogDescription>{props.purpose === 'product_image' ? t('captures.dialog.description.product') : t('captures.dialog.description.purchase')}</DialogDescription>
        </DialogHeader>

        <Switch>
          <Match when={openMutation.isError}>
            <div class="rounded-lg border border-red-500/30 bg-red-500/8 p-4 text-sm">{t('captures.dialog.error')}</div>
          </Match>

          <Match when={captureSession()?.status === 'expired'}>
            <div class="flex flex-col items-center gap-3 py-6 text-center text-sm">
              <div class="i-tabler-clock-x size-8 text-muted-foreground" />
              <p>{t('captures.dialog.expired')}</p>
              <Button size="sm" onClick={() => openMutation.mutate()}>{t('captures.dialog.new-code')}</Button>
            </div>
          </Match>

          <Match when={captureUrl()}>
            {getUrl => (
              <div class="flex flex-col items-center gap-4">
                <div class="rounded-xl border bg-white p-3">
                  <QrCode value={getUrl()} class="size-56 [&>svg]:(size-full)" />
                </div>

                <Show when={isUnreachableFromPhone({ url: getUrl() })}>
                  <div class="w-full rounded-lg border border-orange-500/30 bg-orange-500/8 p-3 text-xs">{t('captures.dialog.localhost')}</div>
                </Show>

                <div class="flex w-full items-center gap-3 rounded-lg bg-muted/50 p-3 text-sm">
                  <Show
                    when={documentIds().length > 0}
                    fallback={(
                      <>
                        <div class="i-tabler-device-mobile size-5 shrink-0 animate-pulse text-muted-foreground" />
                        <span class="text-muted-foreground">{t('captures.dialog.waiting')}</span>
                      </>
                    )}
                  >
                    <div class="i-tabler-photo-check size-5 shrink-0 text-emerald-600" />
                    <span class="flex-1">{t('captures.dialog.received', { count: documentIds().length })}</span>
                    <Button size="sm" onClick={deliver}>{t('captures.dialog.continue')}</Button>
                  </Show>
                </div>
              </div>
            )}
          </Match>

          <Match when={true}>
            <div class="flex justify-center py-16">
              <div class="i-tabler-loader-2 size-6 animate-spin text-muted-foreground" />
            </div>
          </Match>
        </Switch>
      </DialogContent>
    </Dialog>
  );
}
