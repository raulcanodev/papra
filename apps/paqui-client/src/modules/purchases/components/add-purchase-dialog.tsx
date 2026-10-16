import { A } from '@solidjs/router';
import { For } from 'solid-js';
import { isTouchDevice } from '@/modules/captures/captures.models';
import { useI18n } from '@/modules/i18n/i18n.provider';
import { cn } from '@/modules/shared/style/cn';
import { ResponsiveDialog } from '@/modules/ui/components/responsive-dialog';

type AddPurchaseOption = {
  id: string;
  icon: string;
  title: string;
  description: string;
  isHighlighted?: boolean;
  href?: string;
  onSelect?: () => void;
};

// The single "Add purchase" of the purchases page: one choice of how, instead of a button per way
export function AddPurchaseDialog(props: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onUpload: () => void;
  onPhoto: () => void;
  manualHref: string;
}) {
  const { t } = useI18n();

  const options = (): AddPurchaseOption[] => [
    { id: 'upload', icon: 'i-tabler-upload', title: t('purchases.add.upload.title'), description: t('purchases.add.upload.description'), isHighlighted: true, onSelect: () => props.onUpload() },
    { id: 'photo', icon: 'i-tabler-camera', title: t('purchases.add.photo.title'), description: isTouchDevice() ? t('purchases.add.photo.description') : t('purchases.add.photo.description-desktop'), onSelect: () => props.onPhoto() },
    { id: 'manual', icon: 'i-tabler-pencil', title: t('purchases.add.manual.title'), description: t('purchases.add.manual.description'), href: props.manualHref },
  ];

  const optionClass = (option: AddPurchaseOption) => cn(
    'flex w-full items-center gap-3.5 rounded-2xl border p-3.5 text-left transition-colors active:scale-98 sm:flex-col sm:items-start sm:gap-4 sm:p-4',
    option.isHighlighted ? 'border-primary bg-primary text-primary-foreground hover:bg-primary/90' : 'bg-card hover:bg-muted/50',
  );

  const content = (option: AddPurchaseOption) => (
    <>
      <span class={cn('flex size-10 shrink-0 items-center justify-center rounded-xl', option.isHighlighted ? 'bg-primary-foreground/15' : 'bg-muted')}>
        <div class={cn(option.icon, 'size-5')} />
      </span>
      <span class="min-w-0">
        <span class="block text-[15px] font-semibold">{option.title}</span>
        <span class={cn('block text-sm', option.isHighlighted ? 'opacity-80' : 'text-muted-foreground')}>{option.description}</span>
      </span>
    </>
  );

  return (
    <ResponsiveDialog open={props.open} onOpenChange={props.onOpenChange} title={t('purchases.add.title')} description={t('purchases.add.description')} class="sm:max-w-2xl">
      <div class="grid gap-2.5 sm:grid-cols-3">
        <For each={options()}>
          {option => (option.href
            ? <A href={option.href} class={optionClass(option)} onClick={() => props.onOpenChange(false)}>{content(option)}</A>
            : (
                // The chooser closes first: the file picker and the camera open over the page, not over the dialog
                <button
                  type="button"
                  class={optionClass(option)}
                  onClick={() => {
                    props.onOpenChange(false);
                    option.onSelect?.();
                  }}
                >
                  {content(option)}
                </button>
              ))}
        </For>
      </div>
    </ResponsiveDialog>
  );
}
