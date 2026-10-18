import { Buffer } from 'node:buffer';
import PDFDocument from 'pdfkit';
import { formatDate, formatQuantity } from '../invoicing/invoicing.pdf';

type Party = {
  name: string;
  taxId?: string | null;
  email?: string | null;
  phone?: string | null;
  addressLine1?: string | null;
  addressLine2?: string | null;
  postalCode?: string | null;
  city?: string | null;
  region?: string | null;
  country?: string | null;
};

export type PdfDeliveryNote = {
  number: string | null;
  date: Date;
  notes: string | null;
  items: Array<{ description: string; quantityMillis: number }>;
};

const PAGE = { width: 595.28, height: 841.89, margin: 48 };
const SIGNATURES_HEIGHT = 150;

// The paper handed with the goods, no prices: what and how much. Printed in the language of the company, signed by the
// carrier and by the customer
const LABELS = {
  es: { title: 'ALBARÁN', from: 'EMISOR', to: 'ENTREGAR A', product: 'PRODUCTO', quantity: 'CANTIDAD', notes: 'OBSERVACIONES', carrier: 'TRANSPORTISTA', carrierFields: 'Nombre y DNI / matrícula', received: 'RECIBÍ CONFORME', receivedFields: 'Nombre, fecha y sello del cliente', signature: 'Firma', date: 'Fecha', phone: 'Tel.' },
  en: { title: 'DELIVERY NOTE', from: 'FROM', to: 'DELIVER TO', product: 'PRODUCT', quantity: 'QUANTITY', notes: 'NOTES', carrier: 'CARRIER', carrierFields: 'Name and ID / plate', received: 'RECEIVED IN GOOD ORDER', receivedFields: 'Customer name, date and stamp', signature: 'Signature', date: 'Date', phone: 'Phone' },
} as const;

export async function renderDeliveryNotePdf({ deliveryNote, seller, customer, accentColor, locale }: {
  deliveryNote: PdfDeliveryNote;
  seller: Party;
  customer: Party;
  accentColor: string | null;
  locale: string;
}): Promise<Buffer> {
  const labels = locale.toLowerCase().startsWith('es') ? LABELS.es : LABELS.en;
  const accent = accentColor !== null && /^#[0-9a-f]{6}$/i.test(accentColor) ? accentColor : '#111827';
  const muted = '#6b7280';
  const line = '#e5e7eb';
  const doc = new PDFDocument({
    size: 'A4',
    margin: PAGE.margin,
    bufferPages: true,
    info: { Title: `${labels.title} ${deliveryNote.number ?? ''}`.trim(), Author: seller.name, Creator: 'Paqui', Producer: 'Paqui', CreationDate: deliveryNote.date, ModDate: deliveryNote.date },
  });
  const chunks: Buffer[] = [];
  doc.on('data', (chunk: Uint8Array) => chunks.push(Buffer.from(chunk)));
  const completed = new Promise<Buffer>((resolve, reject) => {
    doc.on('end', () => resolve(Buffer.concat(chunks)));
    doc.on('error', reject);
  });

  doc.font('Helvetica-Bold').fontSize(25).fillColor(accent).text(labels.title, PAGE.margin, PAGE.margin);
  if (deliveryNote.number !== null) {
    doc.font('Helvetica-Bold').fontSize(13).fillColor(accent).text(`Nº ${deliveryNote.number}`, 350, PAGE.margin + 3, { width: 197, align: 'right' });
  }
  doc.font('Helvetica').fontSize(9).fillColor(muted).text(`${labels.date}: ${formatDate(deliveryNote.date, locale)}`, 350, PAGE.margin + 23, { width: 197, align: 'right' });
  doc.moveTo(PAGE.margin, 100).lineTo(PAGE.width - PAGE.margin, 100).strokeColor(line).stroke();

  drawParty({ doc, title: labels.from, party: seller, x: PAGE.margin, y: 116, width: 220, accent, muted, phoneLabel: labels.phone });
  drawParty({ doc, title: labels.to, party: customer, x: 326, y: 116, width: 221, accent, muted, phoneLabel: labels.phone });

  const drawItemsHeader = (y: number) => {
    doc.rect(PAGE.margin, y, PAGE.width - PAGE.margin * 2, 25).fill(accent);
    doc.font('Helvetica-Bold').fontSize(8).fillColor('#ffffff');
    doc.text(labels.product, PAGE.margin + 8, y + 8, { width: 380 });
    doc.text(labels.quantity, 449, y + 8, { width: 90, align: 'right' });
    return y + 25;
  };

  let y = drawItemsHeader(250);
  for (const item of deliveryNote.items) {
    const rowHeight = Math.max(28, doc.font('Helvetica').fontSize(11).heightOfString(item.description, { width: 380 }) + 14);
    if (y + rowHeight > PAGE.height - PAGE.margin - 30) {
      doc.addPage();
      y = drawItemsHeader(PAGE.margin);
    }
    doc.font('Helvetica').fontSize(11).fillColor('#111827').text(item.description, PAGE.margin + 8, y + 8, { width: 380 });
    doc.font('Helvetica-Bold').text(formatQuantity(item.quantityMillis, locale), 449, y + 8, { width: 90, align: 'right' });
    doc.moveTo(PAGE.margin, y + rowHeight).lineTo(PAGE.width - PAGE.margin, y + rowHeight).strokeColor(line).stroke();
    y += rowHeight;
  }

  const notesHeight = deliveryNote.notes === null || deliveryNote.notes === '' ? 0 : doc.font('Helvetica').fontSize(9).heightOfString(deliveryNote.notes, { width: PAGE.width - PAGE.margin * 2 }) + 30;

  // The notes and the signatures stay together on the last page
  if (y + 16 + notesHeight + SIGNATURES_HEIGHT > PAGE.height - PAGE.margin - 20) {
    doc.addPage();
    y = PAGE.margin;
  }

  if (notesHeight > 0) {
    doc.font('Helvetica-Bold').fontSize(8).fillColor(muted).text(labels.notes, PAGE.margin, y + 16);
    doc.font('Helvetica').fontSize(9).fillColor('#374151').text(deliveryNote.notes!, PAGE.margin, y + 31, { width: PAGE.width - PAGE.margin * 2 });
  }

  drawSignatures({ doc, labels, y: PAGE.height - PAGE.margin - 20 - SIGNATURES_HEIGHT, muted, line });

  const range = doc.bufferedPageRange();
  for (let page = range.start; page < range.start + range.count; page += 1) {
    doc.switchToPage(page);
    doc.font('Helvetica').fontSize(8).fillColor(muted).text(`${page + 1} / ${range.count}`, PAGE.margin, PAGE.height - PAGE.margin - 10, { width: PAGE.width - PAGE.margin * 2, align: 'right', lineBreak: false });
  }

  doc.end();
  return completed;
}

function drawParty({ doc, title, party, x, y, width, accent, muted, phoneLabel }: { doc: PDFKit.PDFDocument; title: string; party: Party; x: number; y: number; width: number; accent: string; muted: string; phoneLabel: string }) {
  doc.font('Helvetica-Bold').fontSize(8).fillColor(muted).text(title, x, y, { width });
  doc.font('Helvetica-Bold').fontSize(11).fillColor(accent).text(party.name || '—', x, y + 16, { width });
  const lines = [
    party.taxId,
    party.addressLine1,
    party.addressLine2,
    [party.postalCode, party.city].filter(Boolean).join(' '),
    party.region,
    party.phone === null || party.phone === undefined || party.phone === '' ? null : `${phoneLabel} ${party.phone}`,
    party.email,
  ].filter(Boolean);
  doc.font('Helvetica').fontSize(9).fillColor(muted).text(lines.join('\n'), x, y + 33, { width, lineGap: 2 });
}

// Two boxes at the bottom of the last page: the carrier signs when taking the goods, the customer when receiving them
function drawSignatures({ doc, labels, y, muted, line }: { doc: PDFKit.PDFDocument; labels: typeof LABELS[keyof typeof LABELS]; y: number; muted: string; line: string }) {
  const boxWidth = (PAGE.width - PAGE.margin * 2 - 20) / 2;

  for (const [index, [title, fields]] of ([[labels.carrier, labels.carrierFields], [labels.received, labels.receivedFields]] as const).entries()) {
    const x = PAGE.margin + index * (boxWidth + 20);
    doc.roundedRect(x, y, boxWidth, SIGNATURES_HEIGHT, 6).strokeColor(line).lineWidth(1).stroke();
    doc.font('Helvetica-Bold').fontSize(8).fillColor(muted).text(title, x + 10, y + 10, { width: boxWidth - 20 });
    doc.font('Helvetica').fontSize(8).fillColor(muted).text(fields, x + 10, y + 24, { width: boxWidth - 20 });
    doc.moveTo(x + 10, y + 70).lineTo(x + boxWidth - 10, y + 70).strokeColor(line).stroke();
    doc.font('Helvetica').fontSize(8).fillColor(muted).text(labels.signature, x + 10, y + SIGNATURES_HEIGHT - 20, { width: boxWidth - 20 });
  }
}
