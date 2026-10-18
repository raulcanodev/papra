type PublicPriceList = {
  name: string;
  discountRateBps: number;
  items: Array<{ name: string; description: string | null; unit: string; currency: string; taxRateBps: number; priceMinor: number; netPriceMinor: number }>;
};

const HEADERS = {
  es: ['Producto', 'Descripción', 'Unidad', 'Precio (sin IVA)', 'Descuento %', 'Precio neto (sin IVA)', 'IVA %', 'Moneda'],
  en: ['Product', 'Description', 'Unit', 'Price (excl. tax)', 'Discount %', 'Net price (excl. tax)', 'Tax %', 'Currency'],
} as const;

// Semicolons and decimal commas in Spanish so a double click opens it in Excel with the right columns; the UTF-8 BOM keeps the accents
const UTF8_BOM = [0xEF, 0xBB, 0xBF];

export function buildPriceListCsv({ priceList, lang }: { priceList: PublicPriceList; lang: keyof typeof HEADERS }) {
  const separator = lang === 'es' ? ';' : ',';
  const number = (value: number) => (lang === 'es' ? value.toFixed(2).replace('.', ',') : value.toFixed(2));
  const cell = (value: string) => (value.includes(separator) || /["\n\r]/.test(value) ? `"${value.replace(/"/g, '""')}"` : value);

  const rows = priceList.items.map(item => [
    item.name,
    item.description ?? '',
    item.unit,
    number(item.priceMinor / 100),
    number(priceList.discountRateBps / 100),
    number(item.netPriceMinor / 100),
    number(item.taxRateBps / 100),
    item.currency,
  ]);

  const text = `${[HEADERS[lang], ...rows].map(row => row.map(value => cell(String(value))).join(separator)).join('\r\n')}\r\n`;

  return new Uint8Array([...UTF8_BOM, ...new TextEncoder().encode(text)]);
}
