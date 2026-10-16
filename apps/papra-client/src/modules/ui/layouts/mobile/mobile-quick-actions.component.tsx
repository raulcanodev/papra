import type { Component } from 'solid-js';
import { A, useNavigate, useParams } from '@solidjs/router';
import { For, Show } from 'solid-js';
import { preparePhotoForUpload } from '@/modules/captures/captures.models';
import { useDocumentUpload } from '@/modules/documents/components/document-import-status.component';
import { useI18n } from '@/modules/i18n/i18n.provider';
import { cn } from '@/modules/shared/style/cn';
import { Sheet, SheetContent, SheetTitle } from '@/modules/ui/components/sheet';
import { getOrganizationRouteHref, organizationEntityRoutes } from '@/modules/ui/navigation/organization-navigation';
import { useNavigationCapabilities } from '@/modules/ui/navigation/use-navigation-capabilities';

// What the "+" of the bottom bar opens: the things people do on the go, a photo of a receipt first
export const MobileQuickActions: Component<{ open: boolean; onOpenChange: (open: boolean) => void }> = (props) => {
  const params = useParams();
  const navigate = useNavigate();
  const { t } = useI18n();
  const { uploadDocuments, promptImport } = useDocumentUpload();
  const getCapabilities = useNavigationCapabilities();
  let cameraInput: HTMLInputElement | undefined;

  const close = () => props.onOpenChange(false);

  const onCameraChange = async (files: File[]) => {
    if (files.length === 0) {
      return;
    }

    await uploadDocuments({ files: await Promise.all(files.map(async file => preparePhotoForUpload({ file }))) });
    navigate(getOrganizationRouteHref({ organizationId: params.organizationId, routeId: 'documents' }));
  };

  const getEntityHref = (routeId: 'newInvoice' | 'newPurchaseInvoice') => `/organizations/${params.organizationId}/${organizationEntityRoutes[routeId].path}`;

  const getLinkActions = () => [
    ...(getCapabilities().invoicing
      ? [
          { icon: 'i-tabler-receipt', label: t('layout.mobile.quick-actions.new-invoice'), description: t('layout.mobile.quick-actions.new-invoice.description'), href: getEntityHref('newInvoice') },
          { icon: 'i-tabler-truck', label: t('layout.mobile.quick-actions.new-purchase'), description: t('layout.mobile.quick-actions.new-purchase.description'), href: getEntityHref('newPurchaseInvoice') },
        ]
      : []),
    {
      icon: 'i-tabler-sparkles',
      label: t('layout.mobile.quick-actions.ask-paqui'),
      description: t('layout.mobile.quick-actions.ask-paqui.description'),
      href: getOrganizationRouteHref({ organizationId: params.organizationId, routeId: 'assistant' }),
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

      <Sheet open={props.open} onOpenChange={props.onOpenChange}>
        <SheetContent side="bottom" class="rounded-t-3xl px-4 pt-2 pb-[calc(1.5rem+env(safe-area-inset-bottom))] md:hidden">
          <div class="mx-auto mb-3 h-1.5 w-10 rounded-full bg-muted-foreground/30" aria-hidden="true" />

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
              class="flex min-h-28 flex-col items-start justify-between gap-4 rounded-2xl bg-primary p-3.5 text-left text-primary-foreground transition-transform active:scale-98"
              onClick={() => {
                close();
                cameraInput?.click();
              }}
            >
              <div class="i-tabler-camera size-6.5" />
              <span>
                <span class="block text-base font-semibold">{t('layout.mobile.quick-actions.scan')}</span>
                <span class="block text-sm opacity-80">{t('layout.mobile.quick-actions.scan.description')}</span>
              </span>
            </button>

            <button
              type="button"
              class="flex min-h-28 flex-col items-start justify-between gap-4 rounded-2xl bg-muted p-3.5 text-left transition-transform active:scale-98"
              onClick={() => {
                close();
                void promptImport();
              }}
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
                <A href={action.href} onClick={close} class="flex min-h-15 items-center gap-3.5 px-1 py-3">
                  <span class={cn('flex size-10.5 shrink-0 items-center justify-center rounded-xl', action.isHighlighted ? 'bg-primary text-primary-foreground' : 'bg-muted text-foreground')}>
                    <div class={cn(action.icon, 'size-5')} />
                  </span>
                  <span class="min-w-0 flex-1">
                    <span class="block text-[15px] font-medium">{action.label}</span>
                    <Show when={action.description}>
                      <span class="block text-sm text-muted-foreground">{action.description}</span>
                    </Show>
                  </span>
                </A>
              )}
            </For>
          </div>
        </SheetContent>
      </Sheet>
    </>
  );
};
