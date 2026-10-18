// The price list as an image to send to a customer (by email or a messaging app): products and prices only.
// Drawn on a canvas in the browser from the public data of the price list, so no cost or margin can ever be in it.

export type PublicPriceList = {
  companyName: string;
  name: string;
  discountRateBps: number;
  items: Array<{ name: string; description: string | null; unit: string; currency: string; taxRateBps: number; priceMinor: number; netPriceMinor: number }>;
};

export type PriceListImageLabels = {
  product: string;
  unit: string;
  price: string;
  discount: string;
  netPrice: string;
  validOn: string;
  footer: string;
};

const WIDTH = 1200;
const PADDING = 64;
const SCALE = 2;
const FONT = '"Inter", "Helvetica Neue", Arial, sans-serif';
const COLORS = { text: '#18181b', muted: '#71717a', line: '#e4e4e7', header: '#f4f4f5', accent: '#18181b', zebra: '#fafafa' };

type Column = { label: string; width: number; align: 'left' | 'right'; value: (item: PublicPriceList['items'][number]) => string };

function truncate(context: CanvasRenderingContext2D, text: string, maxWidth: number) {
  if (context.measureText(text).width <= maxWidth) {
    return text;
  }
  let end = text.length;
  while (end > 0 && context.measureText(`${text.slice(0, end)}…`).width > maxWidth) {
    end -= 1;
  }
  return `${text.slice(0, end)}…`;
}

export async function renderPriceListImage({ priceList, labels, locale }: { priceList: PublicPriceList; labels: PriceListImageLabels; locale: string }): Promise<Blob> {
  await document.fonts?.ready;

  const money = (minor: number, currency: string) => new Intl.NumberFormat(locale, { style: 'currency', currency }).format(minor / 100);
  const hasDiscount = priceList.discountRateBps > 0;
  const discountText = `-${(priceList.discountRateBps / 100).toLocaleString(locale, { maximumFractionDigits: 2 })} %`;

  // Without a discount its columns are left out: showing a 0% discount invites the customer to ask for one
  const amountColumns: Column[] = [
    { label: labels.unit, width: 150, align: 'left', value: item => item.unit },
    { label: labels.price, width: 170, align: 'right', value: item => money(item.priceMinor, item.currency) },
    ...(hasDiscount
      ? [
          { label: labels.discount, width: 120, align: 'right', value: () => discountText } satisfies Column,
          { label: labels.netPrice, width: 170, align: 'right', value: item => money(item.netPriceMinor, item.currency) } satisfies Column,
        ]
      : []),
  ];
  const tableWidth = WIDTH - PADDING * 2;
  const productWidth = tableWidth - amountColumns.reduce((total, column) => total + column.width, 0);
  const columns: Column[] = [{ label: labels.product, width: productWidth, align: 'left', value: item => item.name }, ...amountColumns];

  const headerHeight = 150;
  const tableHeaderHeight = 48;
  const rowHeight = (item: PublicPriceList['items'][number]) => (item.description ? 70 : 52);
  const footerHeight = 90;
  const height = PADDING + headerHeight + tableHeaderHeight + priceList.items.reduce((total, item) => total + rowHeight(item), 0) + footerHeight;

  const canvas = document.createElement('canvas');
  canvas.width = WIDTH * SCALE;
  canvas.height = height * SCALE;
  const context = canvas.getContext('2d')!;
  context.scale(SCALE, SCALE);
  context.fillStyle = '#ffffff';
  context.fillRect(0, 0, WIDTH, height);
  context.textBaseline = 'middle';

  // Header: who it is from, which price list, when
  context.fillStyle = COLORS.accent;
  context.fillRect(PADDING, PADDING - 16, 48, 4);
  context.fillStyle = COLORS.text;
  context.font = `700 34px ${FONT}`;
  context.fillText(truncate(context, priceList.companyName || priceList.name, tableWidth), PADDING, PADDING + 24);
  context.font = `500 22px ${FONT}`;
  context.fillStyle = COLORS.muted;
  context.fillText(truncate(context, priceList.companyName ? priceList.name : '', tableWidth - 260), PADDING, PADDING + 66);
  context.font = `400 16px ${FONT}`;
  context.textAlign = 'right';
  context.fillText(labels.validOn, WIDTH - PADDING, PADDING + 66);
  context.textAlign = 'left';

  // Table header
  let y = PADDING + headerHeight;
  context.fillStyle = COLORS.header;
  context.beginPath();
  context.roundRect(PADDING, y, tableWidth, tableHeaderHeight, 8);
  context.fill();
  context.font = `600 14px ${FONT}`;
  context.fillStyle = COLORS.muted;
  let x = PADDING;
  for (const column of columns) {
    context.textAlign = column.align;
    context.fillText(column.label.toUpperCase(), column.align === 'left' ? x + 16 : x + column.width - 16, y + tableHeaderHeight / 2);
    x += column.width;
  }
  y += tableHeaderHeight;

  // Rows
  priceList.items.forEach((item, index) => {
    const height = rowHeight(item);
    if (index % 2 === 1) {
      context.fillStyle = COLORS.zebra;
      context.fillRect(PADDING, y, tableWidth, height);
    }
    x = PADDING;
    for (const [columnIndex, column] of columns.entries()) {
      context.textAlign = column.align;
      const textX = column.align === 'left' ? x + 16 : x + column.width - 16;
      if (columnIndex === 0) {
        context.font = `600 18px ${FONT}`;
        context.fillStyle = COLORS.text;
        context.fillText(truncate(context, item.name, column.width - 32), textX, y + (item.description ? 24 : height / 2));
        if (item.description) {
          context.font = `400 14px ${FONT}`;
          context.fillStyle = COLORS.muted;
          context.fillText(truncate(context, item.description, column.width - 32), textX, y + 48);
        }
      } else {
        const isPrice = column.label === (hasDiscount ? labels.netPrice : labels.price);
        context.font = `${isPrice ? 700 : 400} 17px ${FONT}`;
        context.fillStyle = isPrice ? COLORS.text : COLORS.muted;
        context.fillText(column.value(item), textX, y + height / 2);
      }
      x += column.width;
    }
    y += height;
    context.fillStyle = COLORS.line;
    context.fillRect(PADDING, y - 1, tableWidth, 1);
  });

  // Footer
  context.textAlign = 'left';
  context.font = `400 14px ${FONT}`;
  context.fillStyle = COLORS.muted;
  context.fillText(labels.footer, PADDING, y + 44);

  return new Promise((resolve, reject) => canvas.toBlob(blob => (blob ? resolve(blob) : reject(new Error('The image could not be created'))), 'image/png'));
}
