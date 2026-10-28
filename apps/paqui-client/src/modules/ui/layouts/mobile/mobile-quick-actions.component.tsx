import type { Component } from 'solid-js';
import { A, useLocation, useNavigate, useParams } from '@solidjs/router';
import { createEffect, createSignal, For, on, Show } from 'solid-js';
import { useAiAssistantPanel } from '@/modules/ai-assistant/ai-assistant-panel.provider';
import { preparePhotoForUpload } from '@/modules/captures/captures.models';
import { useDocumentUpload } from '@/modules/documents/components/document-import-status.component';
import { useI18n } from '@/modules/i18n/i18n.provider';
import { usePurchaseUpload } from '@/modules/purchases/use-purchase-upload';
import { cn } from '@/modules/shared/style/cn';
import { Sheet, SheetContent, SheetTitle } from '@/modules/ui/components/sheet';
import { getOrganizationRouteHref, organizationEntityRoutes } from '@/modules/ui/navigation/organization-navigation';
import { useNavigationCapabilities } from '@/modules/ui/navigation/use-navigation-capabilities';

// What the "+" of the bottom bar opens: the things people do on the go, a photo of a receipt first
export const MobileQuickActions: Component<{ open: boolean; onOpenChange: (open: boolean) => void }> = (props) => {
  const params = useParams();
  const navigate = useNavigate();
  const location = useLocation();
  const assistantPanel = useAiAssistantPanel();
  const { t } = useI18n();
  const { uploadDocuments, promptImport } = useDocumentUpload();
  const getCapabilities = useNavigationCapabilities();
  let cameraInput: HTMLInputElement | undefined;
  // A received invoice is rarely typed by hand: it asks how, as the purchases page does, in the same sheet
  const [step, setStep] = createSignal<'actions' | 'purchase'>('actions');
  const purchaseUpload = usePurchaseUpload({ organizationId: () => params.organizationId });

  const close = () => props.onOpenChange(false);

  // The chat hides the bottom bar this sheet belongs to: opened while the sheet is still closing, the sheet would
  // be removed halfway and leave the page locked under the chat. It opens once the sheet is gone
  let afterClose: (() => void) | undefined;
  const closeThen = (action: () => void) => {
    afterClose = action;
    close();
  };
  const onCloseAutoFocus = (event: Event) => {
    if (afterClose) {
      event.preventDefault();
      afterClose();
      afterClose = undefined;
    }
  };

  createEffect(on(() => props.open, (open) => {
    if (!open) {
      setStep('actions');
    }
  }));

  // The sheet stays open while the files upload, then the editor opens on them
  createEffect(on(purchaseUpload.isBusy, (isBusy, wasBusy) => {
    if (wasBusy === true && !isBusy) {
      close();
    }
  }));

  // A photo or a file from here is almost always a receipt or an invoice: it is read and opened for review straight away.
  // Without the invoicing module there are no purchases, it is kept as a document
  const onCameraChange = async (files: File[]) => {
    if (files.length === 0) {
      return;
    }

    const photos = await Promise.all(files.map(async file => preparePhotoForUpload({ file })));

    if (getCapabilities().invoicing) {
      await purchaseUpload.uploadFiles(photos);
      return;
    }

    close();
    await uploadDocuments({ files: photos });
    navigate(getOrganizationRouteHref({ organizationId: params.organizationId, routeId: 'documents' }));
  };

  const onUploadSelect = () => {
    if (getCapabilities().invoicing) {
      purchaseUpload.openFilePicker();
      return;
    }

    close();
    void promptImport();
  };

  const getEntityHref = (routeId: 'newDeliveryNote' | 'newInvoice') => `/organizations/${params.organizationId}/${organizationEntityRoutes[routeId].path}`;

  const getPurchaseOptions = (): { icon: string; label: string; description: string; isHighlighted?: boolean; onSelect?: () => void; href?: string }[] => [
    { icon: 'i-tabler-upload', label: t('purchases.add.upload.title'), description: t('purchases.add.upload.description'), isHighlighted: true, onSelect: purchaseUpload.openFilePicker },
    { icon: 'i-tabler-camera', label: t('purchases.add.photo.title'), description: t('purchases.add.photo.description'), onSelect: purchaseUpload.openPhoto },
    { icon: 'i-tabler-pencil', label: t('purchases.add.manual.title'), description: t('purchases.add.manual.description'), href: purchaseUpload.manualHref() },
  ];

  const getLinkActions = (): { icon?: string; image?: string; label: string; description: string; href?: string; onSelect?: () => void; isHighlighted?: boolean }[] => [
    ...(getCapabilities().invoicing
      ? [
          // Filled on the spot when the goods leave: customer, products and quantities, then printed to sign
          { icon: 'i-tabler-truck-delivery', label: t('layout.mobile.quick-actions.new-delivery-note'), description: t('layout.mobile.quick-actions.new-delivery-note.description'), href: getEntityHref('newDeliveryNote') },
          { icon: 'i-tabler-receipt', label: t('layout.mobile.quick-actions.new-invoice'), description: t('layout.mobile.quick-actions.new-invoice.description'), href: getEntityHref('newInvoice') },
          { icon: 'i-tabler-truck', label: t('layout.mobile.quick-actions.new-purchase'), description: t('layout.mobile.quick-actions.new-purchase.description'), onSelect: () => setStep('purchase') },
        ]
      : []),
    {
      // Talking to Paqui is talking to the mascot, not to a generic AI
      image: '/logo.svg',
      label: t('layout.mobile.quick-actions.ask-paqui'),
      description: t('layout.mobile.quick-actions.ask-paqui.description'),
      // The chat over the whole screen, as the Paqui button of the top bar opens it, not the assistant page
      onSelect: () => closeThen(() => {
        if (location.pathname === getOrganizationRouteHref({ organizationId: params.organizationId, routeId: 'assistant' })) {
          navigate(getOrganizationRouteHref({ organizationId: params.organizationId, routeId: 'home' }));
        }
        assistantPanel.open();
      }),
      isHighlighted: true,
    },
  ];

  return (
    <>
      <input
        ref={cameraInput}
        type="file"
        class="hidden"
        accept="image/*"
        capture="environment"
        onChange={(event) => {
          const files = [...(event.currentTarget.files ?? [])];
          event.currentTarget.value = '';
          void onCameraChange(files);
        }}
      />

      {purchaseUpload.elements}

      <Sheet open={props.open} onOpenChange={props.onOpenChange}>
        <SheetContent side="bottom" onDragClose={close} onCloseAutoFocus={onCloseAutoFocus} class="rounded-t-3xl px-4 pt-2 pb-[calc(1.5rem+env(safe-area-inset-bottom))] md:hidden">
          <div class="mx-auto mb-3 h-1.5 w-10 rounded-full bg-muted-foreground/30" aria-hidden="true" />

          <Show
            when={step() === 'purchase'}
            fallback={(
              <>
                <div class="mb-4 flex items-center justify-between">
                  <SheetTitle class="text-xl font-bold">{t('layout.mobile.quick-actions.title')}</SheetTitle>
                  <button
                    type="button"
                    onClick={close}
                    class="flex size-9 items-center justify-center rounded-full bg-muted text-muted-foreground"
                    aria-label={t('layout.mobile.quick-actions.close')}
                  >
                    <div class="i-tabler-x size-4.5" />
                  </button>
                </div>

                <div class="grid grid-cols-2 gap-2.5">
                  <button
                    type="button"
                    class="flex min-h-28 flex-col items-start justify-between gap-4 rounded-2xl bg-primary p-3.5 text-left text-primary-foreground transition-transform active:scale-98 disabled:opacity-70"
                    disabled={purchaseUpload.isBusy()}
                    onClick={() => cameraInput?.click()}
                  >
                    <div class={cn(purchaseUpload.isBusy() ? 'i-tabler-loader-2 animate-spin' : 'i-tabler-camera', 'size-6.5')} />
                    <span>
                      <span class="block text-base font-semibold">{t('layout.mobile.quick-actions.scan')}</span>
                      <span class="block text-sm opacity-80">{t('layout.mobile.quick-actions.scan.description')}</span>
                    </span>
                  </button>

                  <button
                    type="button"
                    class="flex min-h-28 flex-col items-start justify-between gap-4 rounded-2xl bg-muted p-3.5 text-left transition-transform active:scale-98 disabled:opacity-70"
                    disabled={purchaseUpload.isBusy()}
                    onClick={onUploadSelect}
                  >
                    <div class="i-tabler-upload size-6.5" />
                    <span>
                      <span class="block text-base font-semibold">{t('layout.mobile.quick-actions.upload')}</span>
                      <span class="block text-sm text-muted-foreground">{t('layout.mobile.quick-actions.upload.description')}</span>
                    </span>
                  </button>
                </div>

                <div class="mt-2 grid divide-y">
                  <For each={getLinkActions()}>
                    {action => (
                      <QuickActionRow
                        icon={action.icon}
                        image={action.image}
                        label={action.label}
                        description={action.description}
                        isHighlighted={action.isHighlighted}
                        href={action.href}
                        onClick={() => (action.href === undefined ? action.onSelect?.() : close())}
                      />
                    )}
                  </For>
                </div>
              </>
            )}
          >
            <div class="mb-1 flex items-center gap-2">
              <button
                type="button"
                onClick={() => setStep('actions')}
                class="-ml-1 flex size-9 items-center justify-center rounded-full text-muted-foreground"
                aria-label={t('layout.mobile.quick-actions.back')}
              >
                <div class="i-tabler-chevron-left size-5" />
              </button>
              <SheetTitle class="flex-1 text-xl font-bold">{t('purchases.add.title')}</SheetTitle>
              <button
                type="button"
                onClick={close}
                class="flex size-9 items-center justify-center rounded-full bg-muted text-muted-foreground"
                aria-label={t('layout.mobile.quick-actions.close')}
              >
                <div class="i-tabler-x size-4.5" />
              </button>
            </div>
            <p class="mb-2 pl-10 text-sm text-muted-foreground">{t('purchases.add.description')}</p>

            <div class="grid divide-y">
              <For each={getPurchaseOptions()}>
                {option => (
                  <QuickActionRow
                    icon={option.icon}
                    label={option.label}
                    description={option.description}
                    isHighlighted={option.isHighlighted}
                    href={option.href}
                    isBusy={option.onSelect !== undefined && purchaseUpload.isBusy()}
                    onClick={() => (option.href === undefined ? option.onSelect?.() : close())}
                  />
                )}
              </For>
            </div>
          </Show>
        </SheetContent>
      </Sheet>
    </>
  );
};

// One entry of the sheet: a page to open, or a step that happens here (a file picker, the camera, the next choice)
function QuickActionRow(props: { icon?: string; image?: string; label: string; description?: string; isHighlighted?: boolean; isBusy?: boolean; href?: string; onClick: () => void }) {
  const content = () => (
    <>
      <span class={cn('flex size-10.5 shrink-0 items-center justify-center rounded-xl', props.isHighlighted ? 'bg-primary text-primary-foreground' : 'bg-muted text-foreground')}>
        <Show when={props.image} fallback={<div class={cn(props.isBusy ? 'i-tabler-loader-2 animate-spin' : props.icon, 'size-5')} />}>
          {image => <img src={image()} alt="" width="28" height="28" class="size-7 [image-rendering:pixelated]" />}
        </Show>
      </span>
      <span class="min-w-0 flex-1">
        <span class="block text-[15px] font-medium">{props.label}</span>
        <Show when={props.description}>
          <span class="block text-sm text-muted-foreground">{props.description}</span>
        </Show>
      </span>
    </>
  );
  const rowClass = 'flex min-h-15 w-full items-center gap-3.5 px-1 py-3 text-left disabled:opacity-60';

  return (
    <Show when={props.href} fallback={<button type="button" class={rowClass} disabled={props.isBusy} onClick={() => props.onClick()}>{content()}</button>}>
      {href => <A href={href()} onClick={() => props.onClick()} class={rowClass}>{content()}</A>}
    </Show>
  );
}
