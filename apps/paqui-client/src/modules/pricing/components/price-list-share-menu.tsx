import { useI18n } from '@/modules/i18n/i18n.provider';
import { Button } from '@/modules/ui/components/button';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/modules/ui/components/dropdown-menu';
import { usePriceListDownloads } from './price-list-downloads';

/** Shares the price list that applies to a contact, as a PDF or an image to send them */
export function PriceListShareMenu(props: { organizationId: string; priceList?: { id: string; name: string }; disabled?: boolean }) {
  const { t } = useI18n();
  const { downloadImage, downloadPdf } = usePriceListDownloads({ organizationId: () => props.organizationId });

  return (
    <DropdownMenu>
      <DropdownMenuTrigger as={Button} variant="outline" class="h-9 gap-1.5" disabled={props.disabled || !props.priceList}>
        <div class="i-tabler-share size-4" />
        {t('pricing.share')}
        <div class="i-tabler-chevron-down size-3.5 opacity-60" />
      </DropdownMenuTrigger>
      <DropdownMenuContent class="min-w-56">
        <DropdownMenuItem class="flex cursor-pointer items-center gap-2" onSelect={() => props.priceList && void downloadPdf({ priceListId: props.priceList.id, name: props.priceList.name })}>
          <div class="i-tabler-file-type-pdf size-4" />
          {t('pricing.download.pdf')}
        </DropdownMenuItem>
        <DropdownMenuItem class="flex cursor-pointer items-center gap-2" onSelect={() => props.priceList && void downloadImage({ priceListId: props.priceList.id, name: props.priceList.name })}>
          <div class="i-tabler-photo size-4" />
          {t('pricing.download.image')}
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
