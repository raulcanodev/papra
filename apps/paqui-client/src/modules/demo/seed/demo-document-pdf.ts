import type { jsPDF as JsPdf } from 'jspdf';

/** A plain one page document (contract, tax receipt, quote...) rendered in the browser for the demo seed */
export async function renderDemoDocumentPdf({ title, lines, date, issuer }: { title: string; lines: string[]; date: Date; issuer: string }): Promise<Blob> {
  const { jsPDF } = await import('jspdf');
  // eslint-disable-next-line new-cap
  const doc: JsPdf = new jsPDF({ unit: 'pt', format: 'a4' });
  const left = 56;
  let y = 72;

  doc.setFont('helvetica', 'normal').setFontSize(9).setTextColor(107, 114, 128).text(issuer, left, y);
  doc.text(new Intl.DateTimeFormat('es', { dateStyle: 'long' }).format(date), 595 - left, y, { align: 'right' });
  y += 40;
  doc.setFont('helvetica', 'bold').setFontSize(18).setTextColor(17, 24, 39).text(doc.splitTextToSize(title, 595 - left * 2) as string[], left, y);
  y += 40;
  doc.setFont('helvetica', 'normal').setFontSize(11).setTextColor(55, 65, 81);

  for (const line of lines) {
    const wrapped = doc.splitTextToSize(line, 595 - left * 2) as string[];
    doc.text(wrapped, left, y);
    y += wrapped.length * 16 + 6;
  }

  return doc.output('blob');
}
