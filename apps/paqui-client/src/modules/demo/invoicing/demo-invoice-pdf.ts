import type { jsPDF as JsPdf } from 'jspdf';
import { getInvoicePayableMinor } from '../../invoicing/invoicing.models';

type Party = Record<string, any>;

function hexToRgb(hex: string): [number, number, number] {
  const value = /^#?([0-9a-f]{6})$/i.exec(hex)?.[1] ?? '111827';
  return [Number.parseInt(value.slice(0, 2), 16), Number.parseInt(value.slice(2, 4), 16), Number.parseInt(value.slice(4, 6), 16)];
}

function partyLines(party: Party) {
  return [
    party.legalName ?? party.name,
    party.taxId,
    party.addressLine1,
    party.addressLine2,
    [party.postalCode, party.city].filter(Boolean).join(' '),
    party.email,
  ].filter((line): line is string => typeof line === 'string' && line.length > 0);
}

/** Renders a simple invoice PDF in the browser. Used only by the public demo, where there is no server. */
export async function renderDemoInvoicePdf({ invoice, seller, branding }: { invoice: Party; seller: Party; branding: Party }): Promise<Blob> {
  const { jsPDF } = await import('jspdf');
  // eslint-disable-next-line new-cap
  const doc: JsPdf = new jsPDF({ unit: 'pt', format: 'a4' });
  const locale = seller.locale ?? 'es';
  const money = (minor: number) => new Intl.NumberFormat(locale, { style: 'currency', currency: invoice.currency }).format(minor / 100);
  const date = (value: string) => new Intl.DateTimeFormat(locale, { dateStyle: 'medium' }).format(new Date(value));
  const accent = hexToRgb(branding.accentColor ?? '#111827');
  const left = 48;
  const right = 595 - 48;
  let y = 64;

  doc.setFont('helvetica', 'bold').setFontSize(22).setTextColor(...accent).text(locale === 'es' ? 'Factura' : 'Invoice', left, y);
  doc.setFontSize(11).setTextColor(17, 24, 39).text(invoice.number ?? '', right, y, { align: 'right' });
  y += 18;
  doc.setFont('helvetica', 'normal').setFontSize(9).setTextColor(107, 114, 128);
  doc.text(`${date(invoice.issueDate)}  ·  ${locale === 'es' ? 'Vence' : 'Due'} ${date(invoice.dueDate)}`, right, y, { align: 'right' });

  y += 36;
  doc.setFontSize(8).setTextColor(107, 114, 128).text(locale === 'es' ? 'EMISOR' : 'FROM', left, y).text(locale === 'es' ? 'CLIENTE' : 'BILL TO', 320, y);
  y += 14;
  doc.setFontSize(10).setTextColor(17, 24, 39);
  partyLines(seller).forEach((line, index) => doc.text(line, left, y + index * 13));
  partyLines(invoice.customer ?? { name: invoice.customerName }).forEach((line, index) => doc.text(line, 320, y + index * 13));
  y += 6 * 13 + 24;

  // Items table
  doc.setFillColor(...accent).rect(left, y, right - left, 22, 'F');
  doc.setFont('helvetica', 'bold').setFontSize(9).setTextColor(255, 255, 255);
  doc.text(locale === 'es' ? 'Concepto' : 'Description', left + 8, y + 15);
  doc.text(locale === 'es' ? 'Cant.' : 'Qty', 330, y + 15, { align: 'right' });
  doc.text(locale === 'es' ? 'Precio' : 'Price', 410, y + 15, { align: 'right' });
  doc.text('IVA', 450, y + 15, { align: 'right' });
  doc.text('Total', right - 8, y + 15, { align: 'right' });
  y += 22;

  doc.setFont('helvetica', 'normal').setTextColor(17, 24, 39);
  for (const item of invoice.items ?? []) {
    const gross = Math.round(item.quantityMillis * item.unitPriceMinor / 1_000);
    const net = Math.max(0, gross - Math.round(gross * item.discountRateBps / 10_000) - (item.discountMinor ?? 0));
    y += 20;
    doc.text(String(item.description).slice(0, 52), left + 8, y);
    doc.text(String(item.quantityMillis / 1_000), 330, y, { align: 'right' });
    doc.text(money(item.unitPriceMinor), 410, y, { align: 'right' });
    doc.text(`${item.taxRateBps / 100}%`, 450, y, { align: 'right' });
    doc.text(money(net), right - 8, y, { align: 'right' });
    doc.setDrawColor(229, 231, 235).line(left, y + 7, right, y + 7);
  }

  y += 40;
  const totals: Array<[string, string, boolean]> = [
    [locale === 'es' ? 'Base imponible' : 'Subtotal', money(invoice.subtotalMinor), false],
    ['IVA', money(invoice.taxMinor), false],
    // With an IRPF withholding: the invoice total, the withholding, then what the customer actually pays
    ...(invoice.withholdingMinor > 0
      ? [
          ['Total', money(invoice.totalMinor), false] as [string, string, boolean],
          [`${locale === 'es' ? 'Retención IRPF' : 'IRPF withholding'} (${invoice.withholdingRateBps / 100}%)`, `-${money(invoice.withholdingMinor)}`, false] as [string, string, boolean],
          [locale === 'es' ? 'Total a pagar' : 'Amount due', money(getInvoicePayableMinor({ totalMinor: invoice.totalMinor, withholdingMinor: invoice.withholdingMinor })), true] as [string, string, boolean],
        ]
      : [['Total', money(invoice.totalMinor), true] as [string, string, boolean]]),
  ];
  for (const [label, value, strong] of totals) {
    doc.setFont('helvetica', strong ? 'bold' : 'normal').setFontSize(strong ? 12 : 10).setTextColor(17, 24, 39);
    doc.text(label, 380, y).text(value, right - 8, y, { align: 'right' });
    y += strong ? 22 : 16;
  }

  y += 16;
  doc.setFont('helvetica', 'normal').setFontSize(9).setTextColor(107, 114, 128);
  for (const block of [invoice.notes, invoice.terms, branding.paymentDetails]) {
    if (block) {
      const lines = doc.splitTextToSize(String(block), right - left);
      doc.text(lines, left, y);
      y += lines.length * 12 + 8;
    }
  }

  doc.setFontSize(8).text(branding.footerText ?? 'Demo · documento generado en tu navegador, sin valor fiscal', left, 800);

  return doc.output('blob');
}
