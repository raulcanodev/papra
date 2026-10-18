import type { jsPDF as JsPdf } from 'jspdf';

type Stored = Record<string, any>;

function partyLines(party: Stored) {
  return [
    party.legalName ?? party.name,
    party.taxId,
    party.addressLine1,
    [party.postalCode, party.city].filter(Boolean).join(' '),
    party.phone ? `Tel. ${party.phone}` : null,
  ].filter((line): line is string => typeof line === 'string' && line.length > 0);
}

/** Renders the delivery note PDF in the browser, like the server does: no prices, two boxes to sign. Demo only. */
export async function renderDemoDeliveryNotePdf({ deliveryNote, seller, customer }: { deliveryNote: Stored; seller: Stored; customer: Stored }): Promise<Blob> {
  const { jsPDF } = await import('jspdf');
  // eslint-disable-next-line new-cap
  const doc: JsPdf = new jsPDF({ unit: 'pt', format: 'a4' });
  const left = 48;
  const right = 595 - 48;
  let y = 70;

  doc.setFont('helvetica', 'bold').setFontSize(24).setTextColor(30, 58, 95).text('ALBARÁN', left, y);
  if (deliveryNote.number) {
    doc.setFontSize(13).text(`Nº ${deliveryNote.number}`, right, y - 6, { align: 'right' });
  }
  doc.setFont('helvetica', 'normal').setFontSize(9).setTextColor(107, 114, 128);
  doc.text(`Fecha: ${new Intl.DateTimeFormat('es-ES', { dateStyle: 'medium', timeZone: 'UTC' }).format(new Date(deliveryNote.date))}`, right, y + 10, { align: 'right' });

  y += 40;
  doc.setFontSize(8).text('EMISOR', left, y).text('ENTREGAR A', 320, y);
  y += 16;
  doc.setFontSize(10).setTextColor(17, 24, 39);
  partyLines(seller).forEach((line, index) => doc.text(line, left, y + index * 13));
  partyLines(customer).forEach((line, index) => doc.text(line, 320, y + index * 13));
  y += 5 * 13 + 24;

  doc.setFillColor(30, 58, 95).rect(left, y, right - left, 24, 'F');
  doc.setFont('helvetica', 'bold').setFontSize(8).setTextColor(255, 255, 255);
  doc.text('PRODUCTO', left + 8, y + 15);
  doc.text('CANTIDAD', right - 8, y + 15, { align: 'right' });
  y += 24;

  doc.setFontSize(11).setTextColor(17, 24, 39);
  for (const item of deliveryNote.items as Stored[]) {
    y += 20;
    doc.setFont('helvetica', 'normal').text(String(item.description).slice(0, 70), left + 8, y);
    doc.setFont('helvetica', 'bold').text(new Intl.NumberFormat('es-ES', { maximumFractionDigits: 3 }).format(item.quantityMillis / 1_000), right - 8, y, { align: 'right' });
    doc.setDrawColor(229, 231, 235).line(left, y + 8, right, y + 8);
  }

  if (deliveryNote.notes) {
    y += 34;
    doc.setFont('helvetica', 'bold').setFontSize(8).setTextColor(107, 114, 128).text('OBSERVACIONES', left, y);
    doc.setFont('helvetica', 'normal').setFontSize(9).setTextColor(55, 65, 81).text(doc.splitTextToSize(String(deliveryNote.notes), right - left), left, y + 14);
  }

  const boxWidth = (right - left - 20) / 2;
  const boxY = 842 - 48 - 20 - 150;
  for (const [index, [title, fields]] of [['TRANSPORTISTA', 'Nombre y DNI / matrícula'], ['RECIBÍ CONFORME', 'Nombre, fecha y sello del cliente']].entries()) {
    const x = left + index * (boxWidth + 20);
    doc.setDrawColor(229, 231, 235).roundedRect(x, boxY, boxWidth, 150, 6, 6);
    doc.setFont('helvetica', 'bold').setFontSize(8).setTextColor(107, 114, 128).text(title!, x + 10, boxY + 16);
    doc.setFont('helvetica', 'normal').text(fields!, x + 10, boxY + 30);
    doc.line(x + 10, boxY + 70, x + boxWidth - 10, boxY + 70);
    doc.text('Firma', x + 10, boxY + 140);
  }

  doc.setFontSize(8).text('Demo · documento generado en tu navegador', left, 820);

  return doc.output('blob');
}
