import { describe, expect, test } from 'vitest';
import { renderInvoicePdf } from './invoicing.pdf';

describe('invoice PDF', () => {
  test('renders a valid PDF and supports multiple line items', async () => {
    const invoice = {
      number: 'INV-0001',
      issueDate: new Date('2026-10-13T00:00:00.000Z'),
      dueDate: new Date('2026-11-12T00:00:00.000Z'),
      currency: 'EUR',
      subtotalMinor: 100_000,
      taxMinor: 21_000,
      totalMinor: 121_000,
      withholdingRateBps: 0,
      withholdingMinor: 0,
      notes: 'Thank you',
      terms: 'Payment by bank transfer',
      templateId: 'minimal',
      verifactuQrUrl: 'https://prewww2.aeat.es/wlpl/TIKE-CONT/ValidarQR?nif=B12345678&numserie=INV-0001&fecha=13-10-2026&importe=1210.00',
      sellerSnapshot: JSON.stringify({ legalName: 'Paqui SL', taxId: 'B12345678', locale: 'es-ES' }),
      customerSnapshot: JSON.stringify({ name: 'Acme SA', email: 'billing@example.com' }),
      items: Array.from({ length: 35 }, (_, index) => ({ description: `Service ${index + 1}`, quantityMillis: 1_000, unitPriceMinor: 2_857, taxRateBps: 2_100, discountRateBps: 0 })),
    };
    const pdf = await renderInvoicePdf(invoice);
    const repeatedPdf = await renderInvoicePdf(invoice);

    expect(pdf.subarray(0, 5).toString()).toBe('%PDF-');
    expect(pdf.byteLength).toBeGreaterThan(2_000);
    expect(repeatedPdf.equals(pdf)).toBe(true);
  });

  test('keeps a short VERI*FACTU invoice with an IRPF withholding on one page', async () => {
    const pdf = await renderInvoicePdf({
      number: 'F-2026-0001',
      issueDate: new Date('2026-10-13T00:00:00.000Z'),
      dueDate: new Date('2026-11-12T00:00:00.000Z'),
      currency: 'EUR',
      subtotalMinor: 10_000,
      taxMinor: 2_100,
      totalMinor: 12_100,
      // A professional invoice: the withholding rows must still fit on the single page
      withholdingRateBps: 1_500,
      withholdingMinor: 1_500,
      notes: 'Gracias',
      terms: 'Transferencia',
      templateId: 'minimal',
      sellerSnapshot: JSON.stringify({ legalName: 'Jocrimar SL', taxId: 'B12345678', locale: 'es-ES' }),
      customerSnapshot: JSON.stringify({ name: 'Cliente SL', taxId: 'B87654321' }),
      salesRepresentativeSnapshot: JSON.stringify({ name: 'Raúl Cano', email: 'raul@jocrimar.es' }),
      brandingSnapshot: JSON.stringify({ accentColor: '#0f766e', footerText: 'Jocrimar SL · Yecla', paymentDetails: 'IBAN ES00 0000 0000 0000' }),
      verifactuQrUrl: 'https://prewww2.aeat.es/wlpl/TIKE-CONT/ValidarQR?nif=B12345678&numserie=F-2026-0001&fecha=13-10-2026&importe=121.00',
      items: [{ description: 'Consultoría', quantityMillis: 1_000, unitPriceMinor: 10_000, taxRateBps: 2_100, discountRateBps: 0 }],
    });

    expect(pdf.toString('latin1').match(/\/Type \/Page\b/g)).toHaveLength(1);
  });
});
