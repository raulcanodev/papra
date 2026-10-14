// Fictional data for the public demo. Nothing here is a real company, tax id or email.

const DAY = 24 * 60 * 60 * 1000;

export const demoFiscalProfile = {
  legalName: 'Acme SL',
  taxId: 'B00000000',
  email: 'facturas@acme.example',
  addressLine1: 'Calle de Ejemplo 28, 4ºB',
  addressLine2: null,
  postalCode: '28013',
  city: 'Madrid',
  region: 'Madrid',
  country: 'ES',
  currency: 'EUR',
  locale: 'es',
  paymentTermsDays: 30,
  defaultNotes: 'Gracias por confiar en Acme SL.',
  defaultTerms: 'Pago por transferencia en un plazo de 30 días desde la fecha de factura.',
  templateId: 'minimal' as const,
  defaultWithholdingRateBps: 0,
  // A company: VAT return and corporate tax instalments in the taxes page
  legalForm: 'company' as const,
  vatRegime: 'general' as const,
  incomeTaxMethod: 'direct_simplified' as const,
  lastCorporateTaxQuotaMinor: 1_250_000,
  accountantEmail: 'gestoria@ejemplo.example',
};

export const demoBranding = {
  accentColor: '#0f766e',
  footerText: 'Acme SL · B00000000 · Calle de Ejemplo 28, 28013 Madrid',
  paymentDetails: 'IBAN ES00 0000 0000 0000 0000 0000 (datos de ejemplo)',
};

export const demoTaxRates = [
  { key: 'iva21', name: 'IVA 21%', rateBps: 2100, isDefault: true },
  { key: 'iva10', name: 'IVA 10%', rateBps: 1000, isDefault: false },
  { key: 'iva4', name: 'IVA 4%', rateBps: 400, isDefault: false },
  { key: 'exempt', name: 'Exento', rateBps: 0, isDefault: false },
];

export const demoSeries = [
  { key: 'main', name: 'Facturas 2026', prefix: 'ACME-2026-', padding: 4, isDefault: true },
  { key: 'credit', name: 'Rectificativas', prefix: 'R-2026-', padding: 3, isDefault: false },
];

export const demoSalesRepresentatives = [
  { key: 'laura', name: 'Laura Ejemplo', email: 'laura@acme.example', phone: '+34 600 000 001', taxId: null, notes: null },
  { key: 'diego', name: 'Diego Muestra', email: 'diego@acme.example', phone: '+34 600 000 002', taxId: null, notes: null },
];

export const demoSuppliers = [
  { key: 'nube', name: 'Nube Hosting SL', email: 'facturas@nube.example', phone: '+34 900 000 010', taxId: 'B00000010', addressLine1: 'Calle del Servidor 1', postalCode: '28001', city: 'Madrid', region: 'Madrid', country: 'ES' },
  { key: 'papeleria', name: 'Papelería Ejemplo', email: 'ventas@papeleria.example', phone: '+34 900 000 011', taxId: 'B00000011', addressLine1: 'Avenida de los Folios 22', postalCode: '46001', city: 'Valencia', region: 'Valencia', country: 'ES' },
];

export const demoCustomers: Array<{ key: string; name: string; email: string | null; taxId: string; addressLine1: string; postalCode: string; city: string; region: string; country: string; isSupplier?: boolean }> = [
  { key: 'lumen', name: 'Estudio Lumen SL', email: 'admin@lumen.example', taxId: 'B00000001', addressLine1: 'Avenida de la Muestra 12', postalCode: '08010', city: 'Barcelona', region: 'Barcelona', country: 'ES' },
  // Also a supplier: a contact can play several roles
  { key: 'norte', name: 'Talleres del Norte SA', email: 'compras@norte.example', taxId: 'A00000002', addressLine1: 'Polígono Industrial Demo, nave 7', postalCode: '48940', city: 'Leioa', region: 'Bizkaia', country: 'ES', isSupplier: true },
  { key: 'bruma', name: 'Bruma Café', email: 'hola@bruma.example', taxId: 'B00000003', addressLine1: 'Plaza de Prueba 3', postalCode: '41001', city: 'Sevilla', region: 'Sevilla', country: 'ES' },
  { key: 'cima', name: 'Cima Consultores', email: 'contabilidad@cima.example', taxId: 'B00000004', addressLine1: 'Calle Ficticia 91', postalCode: '46002', city: 'Valencia', region: 'Valencia', country: 'ES' },
  { key: 'marta', name: 'Marta Ejemplo (autónoma)', email: 'marta@ejemplo.example', taxId: '00000000T', addressLine1: 'Calle Inventada 5', postalCode: '50001', city: 'Zaragoza', region: 'Zaragoza', country: 'ES' },
  { key: 'verde', name: 'Verde Mercado Cooperativa', email: null, taxId: 'F00000005', addressLine1: 'Camino de la Demo s/n', postalCode: '30001', city: 'Murcia', region: 'Murcia', country: 'ES' },
];

export const demoProducts = [
  { key: 'design', name: 'Diseño de identidad visual', description: 'Logotipo, paleta y guía de marca', unit: 'ud', unitPriceMinor: 120000, taxKey: 'iva21' },
  { key: 'web', name: 'Desarrollo web', description: 'Sitio web a medida', unit: 'h', unitPriceMinor: 6500, taxKey: 'iva21' },
  { key: 'consulting', name: 'Consultoría estratégica', description: 'Sesión de trabajo de 2 horas', unit: 'ud', unitPriceMinor: 18000, taxKey: 'iva21' },
  { key: 'hosting', name: 'Hosting y mantenimiento', description: 'Cuota mensual', unit: 'mes', unitPriceMinor: 4500, taxKey: 'iva21' },
  { key: 'book', name: 'Manual de formación (impreso)', description: null, unit: 'ud', unitPriceMinor: 2400, taxKey: 'iva4' },
  { key: 'catering', name: 'Servicio de catering', description: 'Evento corporativo', unit: 'ud', unitPriceMinor: 35000, taxKey: 'iva10' },
];

type DemoInvoiceFixture = {
  customerKey: string;
  repKey: string | null;
  status: 'draft' | 'issued' | 'sent' | 'paid';
  /** Days before now the invoice was issued. */
  daysAgo: number;
  paymentTermsDays: number;
  notes?: string;
  items: Array<{ productKey: string | null; description: string; quantity: number; unitPriceMinor: number; taxKey: string; discountPercent?: number }>;
};

export const demoInvoices: DemoInvoiceFixture[] = [
  { customerKey: 'lumen', repKey: 'laura', status: 'paid', daysAgo: 120, paymentTermsDays: 30, items: [{ productKey: 'design', description: 'Diseño de identidad visual', quantity: 1, unitPriceMinor: 120000, taxKey: 'iva21' }, { productKey: 'consulting', description: 'Consultoría estratégica', quantity: 2, unitPriceMinor: 18000, taxKey: 'iva21' }] },
  { customerKey: 'norte', repKey: 'diego', status: 'paid', daysAgo: 96, paymentTermsDays: 30, items: [{ productKey: 'web', description: 'Desarrollo web', quantity: 40, unitPriceMinor: 6500, taxKey: 'iva21' }] },
  { customerKey: 'bruma', repKey: 'laura', status: 'paid', daysAgo: 70, paymentTermsDays: 15, items: [{ productKey: 'catering', description: 'Servicio de catering', quantity: 1, unitPriceMinor: 35000, taxKey: 'iva10' }, { productKey: 'book', description: 'Manual de formación (impreso)', quantity: 12, unitPriceMinor: 2400, taxKey: 'iva4' }] },
  { customerKey: 'cima', repKey: null, status: 'paid', daysAgo: 52, paymentTermsDays: 30, items: [{ productKey: 'consulting', description: 'Consultoría estratégica', quantity: 6, unitPriceMinor: 18000, taxKey: 'iva21', discountPercent: 10 }] },
  { customerKey: 'lumen', repKey: 'laura', status: 'sent', daysAgo: 28, paymentTermsDays: 30, items: [{ productKey: 'hosting', description: 'Hosting y mantenimiento (trimestre)', quantity: 3, unitPriceMinor: 4500, taxKey: 'iva21' }, { productKey: 'web', description: 'Desarrollo web', quantity: 12, unitPriceMinor: 6500, taxKey: 'iva21' }] },
  { customerKey: 'marta', repKey: 'diego', status: 'sent', daysAgo: 14, paymentTermsDays: 30, items: [{ productKey: 'design', description: 'Diseño de identidad visual', quantity: 1, unitPriceMinor: 120000, taxKey: 'iva21', discountPercent: 15 }] },
  { customerKey: 'norte', repKey: 'diego', status: 'issued', daysAgo: 45, paymentTermsDays: 15, notes: 'Factura vencida: recordatorio pendiente.', items: [{ productKey: 'web', description: 'Mantenimiento correctivo', quantity: 8, unitPriceMinor: 6500, taxKey: 'iva21' }] },
  { customerKey: 'verde', repKey: null, status: 'draft', daysAgo: 2, paymentTermsDays: 30, items: [{ productKey: 'consulting', description: 'Consultoría estratégica', quantity: 3, unitPriceMinor: 18000, taxKey: 'iva21' }] },
  { customerKey: 'bruma', repKey: 'laura', status: 'draft', daysAgo: 0, paymentTermsDays: 30, items: [{ productKey: 'catering', description: 'Servicio de catering', quantity: 2, unitPriceMinor: 35000, taxKey: 'iva10' }] },
  ...buildDemoInvoiceHistory(),
];

// Fifteen months of paid invoices before the hand written ones, so the home dashboard has a previous year to compare
// with. Deterministic (no randomness) so every demo visitor sees the same figures, billing slowly growing over time.
function buildDemoInvoiceHistory(): DemoInvoiceFixture[] {
  const customerKeys = ['lumen', 'norte', 'cima', 'bruma', 'marta'];

  return Array.from({ length: 15 }, (_, index) => {
    const monthsBack = 15 - index;
    const growth = 0.7 + index * 0.03;

    return {
      customerKey: customerKeys[index % customerKeys.length]!,
      repKey: index % 2 === 0 ? 'laura' : 'diego',
      status: 'paid' as const,
      daysAgo: 135 + monthsBack * 30,
      paymentTermsDays: 30,
      items: [
        { productKey: 'web', description: 'Desarrollo web', quantity: Math.round((10 + (index % 4) * 6) * growth), unitPriceMinor: 6500, taxKey: 'iva21' },
        { productKey: 'hosting', description: 'Hosting y mantenimiento', quantity: 1, unitPriceMinor: 4500, taxKey: 'iva21' },
      ],
    };
  });
}

export function daysAgoToDate(now: Date, daysAgo: number) {
  return new Date(now.getTime() - daysAgo * DAY);
}
