import { isTouchDevice } from '@/modules/captures/captures.models';
import { useI18n } from '@/modules/i18n/i18n.provider';
import { ChoiceDialog } from '@/modules/ui/components/choice-dialog';

// The single "Add purchase" of the purchases page: one choice of how, instead of a button per way
export function AddPurchaseDialog(props: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onUpload: () => void;
  onPhoto: () => void;
  manualHref: string;
}) {
  const { t } = useI18n();

  return (
    <ChoiceDialog
      open={props.open}
      onOpenChange={props.onOpenChange}
      title={t('purchases.add.title')}
      description={t('purchases.add.description')}
      options={[
        { id: 'upload', icon: 'i-tabler-upload', title: t('purchases.add.upload.title'), description: t('purchases.add.upload.description'), isHighlighted: true, onSelect: () => props.onUpload() },
        { id: 'photo', icon: 'i-tabler-camera', title: t('purchases.add.photo.title'), description: isTouchDevice() ? t('purchases.add.photo.description') : t('purchases.add.photo.description-desktop'), onSelect: () => props.onPhoto() },
        { id: 'manual', icon: 'i-tabler-pencil', title: t('purchases.add.manual.title'), description: t('purchases.add.manual.description'), href: props.manualHref },
      ]}
    />
  );
}
