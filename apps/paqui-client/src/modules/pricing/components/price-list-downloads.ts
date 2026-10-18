import { useI18n } from '@/modules/i18n/i18n.provider';
import { createToast } from '@/modules/ui/components/sonner';
import { renderPriceListImage } from '../price-list-image';
import { downloadPriceListCsv, fetchPublicPriceList, saveBlob } from '../pricing.services';

const toFileName = (name: string) => name.replace(/[^\w.-]+/g, '-');

/** The two ways to hand a price list to a customer: a clean image to send, or a spreadsheet */
export function usePriceListDownloads({ organizationId }: { organizationId: () => string }) {
  const { t, getLocale } = useI18n();

  const downloadImage = async ({ priceListId, name }: { priceListId: string; name: string }) => {
    try {
      const { priceList } = await fetchPublicPriceList({ organizationId: organizationId(), priceListId });
      const blob = await renderPriceListImage({
        priceList,
        locale: getLocale(),
        labels: {
          product: t('pricing.image.product'),
          unit: t('pricing.image.unit'),
          price: t('pricing.image.price'),
          discount: t('pricing.image.discount'),
          netPrice: t('pricing.image.net-price'),
          validOn: t('pricing.image.valid-on', { date: new Intl.DateTimeFormat(getLocale(), { dateStyle: 'long' }).format(new Date()) }),
          footer: t('pricing.image.footer'),
        },
      });
      saveBlob({ blob, fileName: `${toFileName(name)}.png` });
    } catch {
      createToast({ type: 'error', message: t('pricing.download.error') });
    }
  };

  const downloadSpreadsheet = async ({ priceListId, name }: { priceListId: string; name: string }) => {
    try {
      await downloadPriceListCsv({ organizationId: organizationId(), priceListId, name, lang: getLocale().startsWith('es') ? 'es' : 'en' });
    } catch {
      createToast({ type: 'error', message: t('pricing.download.error') });
    }
  };

  return { downloadImage, downloadSpreadsheet };
}
