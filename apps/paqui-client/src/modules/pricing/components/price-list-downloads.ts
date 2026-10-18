import { useI18n } from '@/modules/i18n/i18n.provider';
import { createToast } from '@/modules/ui/components/sonner';
import { renderPriceListImage } from '../price-list-image';
import { downloadPriceListCsv, fetchPublicPriceList, saveBlob } from '../pricing.services';

const toFileName = (name: string) => name.replace(/[^\w.-]+/g, '-');

// A4 in millimetres
const PAGE_WIDTH = 210;
const PAGE_HEIGHT = 297;

/** The price list image laid out on A4 pages: a long list is cut into as many pages as it needs */
async function renderPriceListPdf({ image }: { image: Blob }): Promise<Blob> {
  const { jsPDF } = await import('jspdf');
  const bitmap = await createImageBitmap(image);
  const sliceHeight = Math.floor(bitmap.width * PAGE_HEIGHT / PAGE_WIDTH);
  // eslint-disable-next-line new-cap
  const pdf = new jsPDF({ unit: 'mm', format: 'a4' });

  for (let top = 0; top < bitmap.height; top += sliceHeight) {
    const height = Math.min(sliceHeight, bitmap.height - top);
    const canvas = document.createElement('canvas');
    canvas.width = bitmap.width;
    canvas.height = height;
    canvas.getContext('2d')!.drawImage(bitmap, 0, top, bitmap.width, height, 0, 0, bitmap.width, height);

    if (top > 0) {
      pdf.addPage();
    }
    pdf.addImage(canvas, 'PNG', 0, 0, PAGE_WIDTH, height * PAGE_WIDTH / bitmap.width);
  }

  bitmap.close();
  return pdf.output('blob');
}

/** The ways to hand a price list to a customer: a clean image or PDF to send, or a spreadsheet */
export function usePriceListDownloads({ organizationId }: { organizationId: () => string }) {
  const { t, getLocale } = useI18n();

  const renderImage = async ({ priceListId }: { priceListId: string }) => {
    const { priceList } = await fetchPublicPriceList({ organizationId: organizationId(), priceListId });
    return renderPriceListImage({
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
  };

  const downloadImage = async ({ priceListId, name }: { priceListId: string; name: string }) => {
    try {
      saveBlob({ blob: await renderImage({ priceListId }), fileName: `${toFileName(name)}.png` });
    } catch {
      createToast({ type: 'error', message: t('pricing.download.error') });
    }
  };

  const downloadPdf = async ({ priceListId, name }: { priceListId: string; name: string }) => {
    try {
      const blob = await renderPriceListPdf({ image: await renderImage({ priceListId }) });
      saveBlob({ blob, fileName: `${toFileName(name)}.pdf` });
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

  return { downloadImage, downloadPdf, downloadSpreadsheet };
}
