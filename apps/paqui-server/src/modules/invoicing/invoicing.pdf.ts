import type { InvoiceTemplateId } from './invoicing.constants';
import { Buffer } from 'node:buffer';
import PDFDocument from 'pdfkit';
import QRCode from 'qrcode';
import { getInvoicePayableMinor } from './invoicing.models';

type PartySnapshot = {
  legalName?: string;
  name?: string;
  taxId?: string | null;
  email?: string | null;
  addressLine1?: string | null;
  addressLine2?: string | null;
  postalCode?: string | null;
  city?: string | null;
  region?: string | null;
  country?: string | null;
  locale?: string;
};

type BrandingSnapshot = { accentColor?: string; footerText?: string | null; paymentDetails?: string | null };

export type PdfInvoice = {
  number: string | null;
  issueDate: Date;
  dueDate: Date;
  currency: string;
  subtotalMinor: number;
  taxMinor: number;
  totalMinor: number;
  withholdingRateBps: number;
  withholdingMinor: number;
  notes: string | null;
  terms: string | null;
  templateId: string;
  verifactuQrUrl?: string | null;
  sellerSnapshot: string | null;
  customerSnapshot: string | null;
  salesRepresentativeSnapshot?: string | null;
  brandingSnapshot?: string | null;
  items: Array<{
    description: string;
    quantityMillis: number;
    unitPriceMinor: number;
    taxRateBps: number;
    discountRateBps: number;
  }>;
};

const PAGE = { width: 595.28, height: 841.89, margin: 48 };

export async function renderInvoicePdf(invoice: PdfInvoice): Promise<Buffer> {
  const seller = parseSnapshot(invoice.sellerSnapshot);
  const customer = parseSnapshot(invoice.customerSnapshot);
  const representative = parseSnapshot(invoice.salesRepresentativeSnapshot ?? null);
  const branding = parseBrandingSnapshot(invoice.brandingSnapshot ?? null);
  const templateId: InvoiceTemplateId = invoice.templateId === 'classic' ? 'classic' : 'minimal';
  const accent = branding.accentColor ?? (templateId === 'classic' ? '#1e3a5f' : '#111827');
  const muted = '#6b7280';
  const line = '#e5e7eb';
  const locale = seller.locale ?? 'en';
  const doc = new PDFDocument({
    size: 'A4',
    margin: PAGE.margin,
    bufferPages: true,
    info: {
      Title: `Invoice ${invoice.number ?? ''}`,
      Author: seller.legalName ?? seller.name ?? 'Paqui',
      Creator: 'Paqui',
      Producer: 'Paqui',
      CreationDate: invoice.issueDate,
      ModDate: invoice.issueDate,
    },
  });
  const chunks: Buffer[] = [];
  doc.on('data', (chunk: Uint8Array) => chunks.push(Buffer.from(chunk)));
  const completed = new Promise<Buffer>((resolve, reject) => {
    doc.on('end', () => resolve(Buffer.concat(chunks)));
    doc.on('error', reject);
  });

  const verifactuQr = invoice.verifactuQrUrl !== null && invoice.verifactuQrUrl !== undefined && invoice.verifactuQrUrl !== ''
    ? await QRCode.toBuffer(invoice.verifactuQrUrl, { errorCorrectionLevel: 'M', margin: 2, type: 'png', width: 128 })
    : null;

  drawHeader({ doc, invoice, seller, customer, accent, muted, line, verifactuQr });
  let y = 310;
  y = drawItemsHeader(doc, y, accent, line);

  // Room kept at the bottom of a page for the totals and notes, taller when a withholding adds two rows
  const reservedFooterHeight = invoice.withholdingMinor > 0 ? 230 : 170;
  for (const item of invoice.items) {
    const rowHeight = Math.max(28, doc.heightOfString(item.description, { width: 230 }) + 12);
    if (y + rowHeight > PAGE.height - reservedFooterHeight) {
      doc.addPage();
      y = drawItemsHeader(doc, PAGE.margin, accent, line);
    }
    drawItemRow({ doc, invoice, item, y, height: rowHeight, muted, line, locale });
    y += rowHeight;
  }

  if (y > PAGE.height - 220) {
    doc.addPage();
    y = PAGE.margin;
  }
  const { bottom } = drawTotals({ doc, invoice, y: y + 16, accent, muted, line, locale });
  drawNotes({ doc, invoice, branding, representative, y: bottom + 41, muted });

  const range = doc.bufferedPageRange();
  for (let page = range.start; page < range.start + range.count; page += 1) {
    doc.switchToPage(page);
    doc.font('Helvetica').fontSize(8).fillColor(muted).text(`${page + 1} / ${range.count}`, PAGE.margin, PAGE.height - PAGE.margin - 10, { width: PAGE.width - PAGE.margin * 2, align: 'right', lineBreak: false });
    if (branding.footerText !== null && branding.footerText !== undefined && branding.footerText !== '') {
      doc.font('Helvetica').fontSize(8).fillColor(muted).text(branding.footerText, PAGE.margin, PAGE.height - PAGE.margin - 10, { width: PAGE.width - PAGE.margin * 2 - 55, lineBreak: false });
    }
  }

  doc.end();
  return completed;
}

function drawHeader({ doc, invoice, seller, customer, accent, muted, line, verifactuQr }: { doc: PDFKit.PDFDocument; invoice: PdfInvoice; seller: PartySnapshot; customer: PartySnapshot; accent: string; muted: string; line: string; verifactuQr: Buffer | null }) {
  doc.font('Helvetica-Bold').fontSize(25).fillColor(accent).text('INVOICE', PAGE.margin, PAGE.margin);
  const detailsX = verifactuQr === null ? 350 : 245;
  const detailsWidth = verifactuQr === null ? 197 : 170;
  doc.font('Helvetica-Bold').fontSize(11).fillColor(accent).text(invoice.number ?? 'DRAFT', detailsX, PAGE.margin + 3, { width: detailsWidth, align: 'right' });
  doc.font('Helvetica').fontSize(9).fillColor(muted).text(`Issued ${formatDate(invoice.issueDate, seller.locale)}`, detailsX, PAGE.margin + 23, { width: detailsWidth, align: 'right' });
  doc.text(`Due ${formatDate(invoice.dueDate, seller.locale)}`, detailsX, PAGE.margin + 38, { width: detailsWidth, align: 'right' });
  if (verifactuQr !== null) {
    doc.font('Helvetica-Bold').fontSize(7).fillColor(muted).text('QR tributario:', 431, 20, { width: 116, align: 'center' });
    doc.image(verifactuQr, 445, 29, { fit: [88, 88] });
    doc.font('Helvetica-Bold').fontSize(7).fillColor(accent).text('VERI*FACTU', 431, 119, { width: 116, align: 'center' });
  }
  doc.moveTo(PAGE.margin, 132).lineTo(PAGE.width - PAGE.margin, 132).strokeColor(line).stroke();

  drawParty(doc, { title: 'FROM', party: seller, x: PAGE.margin, y: 150, width: 220, accent, muted });
  drawParty(doc, { title: 'BILL TO', party: customer, x: 326, y: 150, width: 221, accent, muted });
}

function drawParty(doc: PDFKit.PDFDocument, { title, party, x, y, width, accent, muted }: { title: string; party: PartySnapshot; x: number; y: number; width: number; accent: string; muted: string }) {
  doc.font('Helvetica-Bold').fontSize(8).fillColor(muted).text(title, x, y, { width });
  doc.font('Helvetica-Bold').fontSize(11).fillColor(accent).text(party.legalName ?? party.name ?? '—', x, y + 18, { width });
  const lines = [party.taxId, party.addressLine1, party.addressLine2, [party.postalCode, party.city].filter(Boolean).join(' '), party.region, party.country, party.email].filter(Boolean);
  doc.font('Helvetica').fontSize(9).fillColor(muted).text(lines.join('\n'), x, y + 36, { width, lineGap: 2 });
}

function drawItemsHeader(doc: PDFKit.PDFDocument, y: number, accent: string, line: string) {
  doc.rect(PAGE.margin, y, PAGE.width - PAGE.margin * 2, 25).fill(accent);
  doc.font('Helvetica-Bold').fontSize(8).fillColor('#ffffff');
  doc.text('DESCRIPTION', PAGE.margin + 8, y + 8, { width: 225 });
  doc.text('QTY', 285, y + 8, { width: 45, align: 'right' });
  doc.text('PRICE', 340, y + 8, { width: 65, align: 'right' });
  doc.text('TAX', 415, y + 8, { width: 45, align: 'right' });
  doc.text('TOTAL', 470, y + 8, { width: 69, align: 'right' });
  doc.strokeColor(line);
  return y + 25;
}

function drawItemRow({ doc, invoice, item, y, height, muted, line, locale }: { doc: PDFKit.PDFDocument; invoice: PdfInvoice; item: PdfInvoice['items'][number]; y: number; height: number; muted: string; line: string; locale: string }) {
  const gross = Math.round(item.quantityMillis * item.unitPriceMinor / 1_000);
  const net = gross - Math.round(gross * item.discountRateBps / 10_000);
  const total = net + Math.round(net * item.taxRateBps / 10_000);
  doc.font('Helvetica').fontSize(9).fillColor('#111827');
  doc.text(item.description, PAGE.margin + 8, y + 9, { width: 225 });
  doc.fillColor(muted).text(formatQuantity(item.quantityMillis, locale), 285, y + 9, { width: 45, align: 'right' });
  doc.text(formatMoney(item.unitPriceMinor, invoice.currency, locale), 340, y + 9, { width: 65, align: 'right' });
  doc.text(`${item.taxRateBps / 100}%`, 415, y + 9, { width: 45, align: 'right' });
  doc.font('Helvetica-Bold').fillColor('#111827').text(formatMoney(total, invoice.currency, locale), 470, y + 9, { width: 69, align: 'right' });
  doc.moveTo(PAGE.margin, y + height).lineTo(PAGE.width - PAGE.margin, y + height).strokeColor(line).stroke();
}

function drawTotals({ doc, invoice, y, accent, muted, line, locale }: { doc: PDFKit.PDFDocument; invoice: PdfInvoice; y: number; accent: string; muted: string; line: string; locale: string }) {
  const labelX = 345;
  const valueX = 445;
  doc.font('Helvetica').fontSize(9).fillColor(muted).text('Subtotal', labelX, y, { width: 90 });
  doc.text(formatMoney(invoice.subtotalMinor, invoice.currency, locale), valueX, y, { width: 94, align: 'right' });
  doc.text('Tax', labelX, y + 22, { width: 90 });
  doc.text(formatMoney(invoice.taxMinor, invoice.currency, locale), valueX, y + 22, { width: 94, align: 'right' });
  doc.moveTo(labelX, y + 47).lineTo(539, y + 47).strokeColor(line).stroke();

  if (invoice.withholdingMinor <= 0) {
    doc.font('Helvetica-Bold').fontSize(12).fillColor(accent).text('Total', labelX, y + 59, { width: 90 });
    doc.text(formatMoney(invoice.totalMinor, invoice.currency, locale), valueX, y + 59, { width: 94, align: 'right' });

    return { bottom: y + 75 };
  }

  // With a withholding: invoice total (taxes included), the withholding, then what the customer actually pays
  doc.font('Helvetica-Bold').fontSize(9).fillColor('#111827').text('Total', labelX, y + 59, { width: 90 });
  doc.text(formatMoney(invoice.totalMinor, invoice.currency, locale), valueX, y + 59, { width: 94, align: 'right' });
  doc.font('Helvetica').fillColor(muted).text(`IRPF withholding (${invoice.withholdingRateBps / 100}%)`, labelX, y + 81, { width: 100 });
  doc.text(`-${formatMoney(invoice.withholdingMinor, invoice.currency, locale)}`, valueX, y + 81, { width: 94, align: 'right' });
  doc.moveTo(labelX, y + 106).lineTo(539, y + 106).strokeColor(line).stroke();
  doc.font('Helvetica-Bold').fontSize(12).fillColor(accent).text('Amount due', labelX, y + 118, { width: 90 });
  doc.text(formatMoney(getInvoicePayableMinor(invoice), invoice.currency, locale), valueX, y + 118, { width: 94, align: 'right' });

  return { bottom: y + 134 };
}

function drawNotes({ doc, invoice, branding, representative, y, muted }: { doc: PDFKit.PDFDocument; invoice: PdfInvoice; branding: BrandingSnapshot; representative: PartySnapshot; y: number; muted: string }) {
  if (invoice.notes !== null && invoice.notes !== '') {
    doc.font('Helvetica-Bold').fontSize(8).fillColor(muted).text('NOTES', PAGE.margin, y);
    doc.font('Helvetica').fontSize(9).fillColor('#374151').text(invoice.notes, PAGE.margin, y + 15, { width: 255 });
  }
  if (invoice.terms !== null && invoice.terms !== '') {
    doc.font('Helvetica-Bold').fontSize(8).fillColor(muted).text('TERMS', PAGE.margin, y + 65);
    doc.font('Helvetica').fontSize(8).fillColor(muted).text(invoice.terms, PAGE.margin, y + 80, { width: PAGE.width - PAGE.margin * 2 });
  }
  const representativeDetails = representative.name !== null && representative.name !== undefined && representative.name !== ''
    ? `Sales representative: ${representative.name}${representative.email !== null && representative.email !== undefined && representative.email !== '' ? ` · ${representative.email}` : ''}`
    : null;
  const details = [branding.paymentDetails, representativeDetails].filter((value): value is string => value !== null && value !== undefined && value !== '').join('\n');
  if (details !== '') {
    doc.font('Helvetica-Bold').fontSize(8).fillColor(muted).text('PAYMENT & CONTACT', 325, y);
    doc.font('Helvetica').fontSize(8).fillColor(muted).text(details, 325, y + 15, { width: 214 });
  }
}

function parseSnapshot(value: string | null): PartySnapshot {
  if (value === null || value === '') {
    return {};
  }
  try {
    return JSON.parse(value) as PartySnapshot;
  } catch {
    return {};
  }
}

function parseBrandingSnapshot(value: string | null): BrandingSnapshot {
  if (value === null || value === '') {
    return {};
  }
  try {
    const parsed = JSON.parse(value) as BrandingSnapshot;
    return { ...parsed, accentColor: parsed.accentColor !== null && parsed.accentColor !== undefined && parsed.accentColor !== '' && /^#[0-9a-f]{6}$/i.test(parsed.accentColor) ? parsed.accentColor : undefined };
  } catch {
    return {};
  }
}

function formatDate(date: Date, locale = 'en') {
  return new Intl.DateTimeFormat(locale, { dateStyle: 'medium', timeZone: 'UTC' }).format(date);
}

function formatMoney(valueMinor: number, currency: string, locale: string) {
  return new Intl.NumberFormat(locale, { style: 'currency', currency }).format(valueMinor / 100);
}

function formatQuantity(valueMillis: number, locale: string) {
  return new Intl.NumberFormat(locale, { maximumFractionDigits: 3 }).format(valueMillis / 1_000);
}
