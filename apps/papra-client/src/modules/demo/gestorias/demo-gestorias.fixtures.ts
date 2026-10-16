import type { GestoriaModule, GestoriaSummary } from '../../gestorias/gestorias.types';
import type { ExpenseCategory } from '../../purchases/purchases.types';
import type { EntityIconColor } from '../../ui/components/entity-icon.constants';

// The gestoría the demo user also works at, to try the accountant side of the app. Its client companies are Acme SL
// (the demo company, with its real demo records) and two more whose books are generated from the visit date.
// Fictional data only.

export const demoGestoria: GestoriaSummary = {
  id: 'gst_demoejemplo',
  name: 'Gestoría Ejemplo Asesores',
  taxId: 'B00000050',
};

type DemoLine = { description: string; quantityMillis?: number; unitPriceMinor: number; taxRateBps: number };

type DemoParty = { key: string; name: string; taxId: string; icon: string; iconColor: EntityIconColor; email: string | null };

type DemoRecurringSale = { customerKey: string; everyMonths: number; dayOfMonth: number; lines: (monthIndex: number) => DemoLine[] };

type DemoRecurringExpense = { supplierKey: string; prefix: string; category: ExpenseCategory; everyMonths: number; dayOfMonth: number; withholdingRateBps: number; lines: (monthIndex: number) => DemoLine[] };

export type DemoGestoriaClientCompany = {
  organizationId: string;
  name: string;
  legalName: string;
  taxId: string;
  legalForm: 'company' | 'self_employed';
  modules: GestoriaModule[];
  invoicePrefix: string;
  profile: Record<string, unknown>;
  branding: { accentColor: string; footerText: string; paymentDetails: string };
  customers: DemoParty[];
  suppliers: DemoParty[];
  sales: DemoRecurringSale[];
  expenses: DemoRecurringExpense[];
};

// Small month to month swings, deterministic so every visitor sees the same figures
const swing = (monthIndex: number, steps = 5) => 1 + ((monthIndex * 7) % steps) / 10;

export const DEMO_ACME_CLIENT = {
  organizationId: 'org_1GAP1Miap135XEcbKuBQF948',
  name: 'Acme SL',
  legalName: 'Acme SL',
  taxId: 'B00000000',
  legalForm: 'company',
  modules: ['invoices', 'purchases', 'taxes'] as GestoriaModule[],
} as const;

const espiga: DemoGestoriaClientCompany = {
  organizationId: 'org_DemoGestoriaEspiga000001',
  name: 'Panadería La Espiga',
  legalName: 'Rosa Ejemplo Pérez',
  taxId: '00000001R',
  legalForm: 'self_employed',
  modules: ['invoices', 'purchases', 'taxes'],
  invoicePrefix: 'LE',
  profile: {
    legalName: 'Rosa Ejemplo Pérez (Panadería La Espiga)',
    taxId: '00000001R',
    email: 'pedidos@laespiga.example',
    addressLine1: 'Calle del Horno 4',
    postalCode: '37001',
    city: 'Salamanca',
    region: 'Salamanca',
    country: 'ES',
    currency: 'EUR',
    locale: 'es',
    legalForm: 'self_employed',
    vatRegime: 'general',
    incomeTaxMethod: 'direct_simplified',
    lastCorporateTaxQuotaMinor: null,
    accountantEmail: 'clientes@gestoriaejemplo.example',
  },
  branding: { accentColor: '#b45309', footerText: 'Panadería La Espiga · 00000001R · Calle del Horno 4, 37001 Salamanca', paymentDetails: 'IBAN ES00 0000 0000 0000 0000 0001 (datos de ejemplo)' },
  customers: [
    { key: 'bruma', name: 'Bruma Café', taxId: 'B00000003', icon: '☕', iconColor: 'orange', email: 'hola@bruma.example' },
    { key: 'puerto', name: 'Restaurante El Puerto SL', taxId: 'B00000060', icon: '🐟', iconColor: 'blue', email: 'compras@elpuerto.example' },
    { key: 'mirador', name: 'Hotel Mirador', taxId: 'B00000061', icon: '🏨', iconColor: 'purple', email: 'administracion@mirador.example' },
    { key: 'colegio', name: 'Asociación Colegio San Ejemplo', taxId: 'G00000062', icon: '🎒', iconColor: 'green', email: null },
  ],
  suppliers: [
    { key: 'harinera', name: 'Harinera del Valle SA', taxId: 'A00000063', icon: '🌾', iconColor: 'orange', email: 'pedidos@harineradelvalle.example' },
    { key: 'local', name: 'Inmuebles Centro SL', taxId: 'B00000064', icon: 'icon:building', iconColor: 'gray', email: null },
    { key: 'luz', name: 'Energía Ejemplo SA', taxId: 'A00000065', icon: '⚡', iconColor: 'orange', email: null },
    { key: 'gestoria', name: 'Gestoría Ejemplo Asesores SL', taxId: 'B00000050', icon: '📒', iconColor: 'blue', email: 'clientes@gestoriaejemplo.example' },
    { key: 'envases', name: 'Envases Demo SL', taxId: 'B00000066', icon: '📦', iconColor: 'orange', email: null },
    { key: 'hornos', name: 'Servicio Técnico de Hornos SL', taxId: 'B00000067', icon: 'icon:tool', iconColor: 'red', email: null },
  ],
  sales: [
    { customerKey: 'bruma', everyMonths: 1, dayOfMonth: 28, lines: monthIndex => [
      { description: 'Pan de barra (unidades)', quantityMillis: Math.round(620 * swing(monthIndex)) * 1_000, unitPriceMinor: 45, taxRateBps: 400 },
      { description: 'Bollería variada (bandejas)', quantityMillis: Math.round(40 * swing(monthIndex, 4)) * 1_000, unitPriceMinor: 1_200, taxRateBps: 1_000 },
    ] },
    { customerKey: 'puerto', everyMonths: 1, dayOfMonth: 28, lines: monthIndex => [
      { description: 'Pan de hogaza (unidades)', quantityMillis: Math.round(380 * swing(monthIndex)) * 1_000, unitPriceMinor: 180, taxRateBps: 400 },
      { description: 'Picos y colines (kg)', quantityMillis: Math.round(25 * swing(monthIndex, 3)) * 1_000, unitPriceMinor: 650, taxRateBps: 400 },
    ] },
    { customerKey: 'mirador', everyMonths: 1, dayOfMonth: 27, lines: monthIndex => [
      { description: 'Servicio de desayunos: pan y bollería', quantityMillis: 30_000, unitPriceMinor: Math.round(2_400 * swing(monthIndex, 6)), taxRateBps: 1_000 },
    ] },
    { customerKey: 'colegio', everyMonths: 3, dayOfMonth: 20, lines: () => [
      { description: 'Roscón y dulces para fiesta escolar', quantityMillis: 12_000, unitPriceMinor: 1_850, taxRateBps: 1_000 },
    ] },
  ],
  expenses: [
    { supplierKey: 'harinera', prefix: 'HV-', category: 'goods', everyMonths: 1, dayOfMonth: 6, withholdingRateBps: 0, lines: monthIndex => [{ description: 'Harina de trigo T-65 (sacos de 25 kg)', quantityMillis: Math.round(48 * swing(monthIndex)) * 1_000, unitPriceMinor: 1_350, taxRateBps: 400 }] },
    { supplierKey: 'local', prefix: 'IC-', category: 'rent', everyMonths: 1, dayOfMonth: 1, withholdingRateBps: 1_900, lines: () => [{ description: 'Alquiler del local de Calle del Horno 4', unitPriceMinor: 85_000, taxRateBps: 2_100 }] },
    { supplierKey: 'luz', prefix: 'EE-', category: 'supplies', everyMonths: 1, dayOfMonth: 12, withholdingRateBps: 0, lines: monthIndex => [{ description: 'Suministro eléctrico del obrador', unitPriceMinor: Math.round(31_000 * swing(monthIndex, 4)), taxRateBps: 2_100 }] },
    { supplierKey: 'gestoria', prefix: 'GEA/', category: 'professional_services', everyMonths: 1, dayOfMonth: 5, withholdingRateBps: 1_500, lines: () => [{ description: 'Asesoría fiscal y laboral (autónomo con un empleado)', unitPriceMinor: 7_500, taxRateBps: 2_100 }] },
    { supplierKey: 'envases', prefix: 'ED-', category: 'goods', everyMonths: 2, dayOfMonth: 15, withholdingRateBps: 0, lines: () => [{ description: 'Bolsas de papel y cajas de pastelería', unitPriceMinor: 18_400, taxRateBps: 2_100 }] },
    { supplierKey: 'hornos', prefix: 'STH-', category: 'other', everyMonths: 6, dayOfMonth: 18, withholdingRateBps: 0, lines: () => [{ description: 'Revisión semestral del horno de leña', unitPriceMinor: 24_000, taxRateBps: 2_100 }] },
  ],
};

const ruedas: DemoGestoriaClientCompany = {
  organizationId: 'org_DemoGestoriaRuedas000001',
  name: 'Ruedas Taller Mecánico',
  legalName: 'Ruedas Taller Mecánico SL',
  taxId: 'B00000070',
  legalForm: 'company',
  // The gestoría keeps its books but files its taxes elsewhere: no taxes module, the menu shows two pages only
  modules: ['invoices', 'purchases'],
  invoicePrefix: 'RTM',
  profile: {
    legalName: 'Ruedas Taller Mecánico SL',
    taxId: 'B00000070',
    email: 'taller@ruedas.example',
    addressLine1: 'Polígono Ejemplo, nave 12',
    postalCode: '29006',
    city: 'Málaga',
    region: 'Málaga',
    country: 'ES',
    currency: 'EUR',
    locale: 'es',
    legalForm: 'company',
    vatRegime: 'general',
    incomeTaxMethod: 'direct_normal',
    lastCorporateTaxQuotaMinor: 820_000,
    accountantEmail: 'clientes@gestoriaejemplo.example',
  },
  branding: { accentColor: '#1d4ed8', footerText: 'Ruedas Taller Mecánico SL · B00000070 · Polígono Ejemplo, nave 12, 29006 Málaga', paymentDetails: 'IBAN ES00 0000 0000 0000 0000 0002 (datos de ejemplo)' },
  customers: [
    { key: 'transportes', name: 'Transportes Rápidos SL', taxId: 'B00000071', icon: '🚚', iconColor: 'blue', email: 'flota@transportesrapidos.example' },
    { key: 'autoescuela', name: 'Autoescuela Vía Libre', taxId: 'B00000072', icon: '🚗', iconColor: 'green', email: 'admin@vialibre.example' },
    { key: 'ayuntamiento', name: 'Ayuntamiento de Villaejemplo', taxId: 'P0000007A', icon: '🏛️', iconColor: 'gray', email: null },
  ],
  suppliers: [
    { key: 'recambios', name: 'Recambios Auto Sur SA', taxId: 'A00000073', icon: 'icon:tool', iconColor: 'orange', email: 'pedidos@recambiossur.example' },
    { key: 'nave', name: 'Naves Industriales Demo SL', taxId: 'B00000074', icon: 'icon:building', iconColor: 'gray', email: null },
    { key: 'luz', name: 'Energía Ejemplo SA', taxId: 'A00000065', icon: '⚡', iconColor: 'orange', email: null },
    { key: 'software', name: 'Software Taller Pro SL', taxId: 'B00000075', icon: 'icon:code', iconColor: 'purple', email: null },
    { key: 'seguro', name: 'Seguros Ejemplo SA', taxId: 'A00000076', icon: '🛡️', iconColor: 'red', email: null },
  ],
  sales: [
    { customerKey: 'transportes', everyMonths: 1, dayOfMonth: 25, lines: monthIndex => [
      { description: 'Mano de obra: mantenimiento de flota (horas)', quantityMillis: Math.round(22 * swing(monthIndex)) * 1_000, unitPriceMinor: 4_800, taxRateBps: 2_100 },
      { description: 'Recambios: filtros, pastillas y aceite', unitPriceMinor: Math.round(96_000 * swing(monthIndex, 4)), taxRateBps: 2_100 },
    ] },
    { customerKey: 'autoescuela', everyMonths: 1, dayOfMonth: 18, lines: monthIndex => [
      { description: 'Revisión pre-ITV de vehículos de prácticas', quantityMillis: 3_000, unitPriceMinor: 6_500, taxRateBps: 2_100 },
      { description: 'Neumáticos (unidades)', quantityMillis: (monthIndex % 3 === 0 ? 8 : 4) * 1_000, unitPriceMinor: 8_900, taxRateBps: 2_100 },
    ] },
    { customerKey: 'ayuntamiento', everyMonths: 2, dayOfMonth: 10, lines: monthIndex => [
      { description: 'Reparación de vehículos municipales (expediente de contrato menor)', unitPriceMinor: Math.round(210_000 * swing(monthIndex, 3)), taxRateBps: 2_100 },
    ] },
  ],
  expenses: [
    { supplierKey: 'recambios', prefix: 'RAS-', category: 'goods', everyMonths: 1, dayOfMonth: 4, withholdingRateBps: 0, lines: monthIndex => [{ description: 'Recambios y consumibles del mes', unitPriceMinor: Math.round(142_000 * swing(monthIndex)), taxRateBps: 2_100 }] },
    { supplierKey: 'nave', prefix: 'NID-', category: 'rent', everyMonths: 1, dayOfMonth: 1, withholdingRateBps: 1_900, lines: () => [{ description: 'Alquiler de la nave 12', unitPriceMinor: 120_000, taxRateBps: 2_100 }] },
    { supplierKey: 'luz', prefix: 'EE-', category: 'supplies', everyMonths: 1, dayOfMonth: 14, withholdingRateBps: 0, lines: monthIndex => [{ description: 'Suministro eléctrico de la nave', unitPriceMinor: Math.round(26_500 * swing(monthIndex, 4)), taxRateBps: 2_100 }] },
    { supplierKey: 'software', prefix: 'STP-', category: 'software', everyMonths: 1, dayOfMonth: 2, withholdingRateBps: 0, lines: () => [{ description: 'Licencia del programa de gestión del taller', unitPriceMinor: 5_900, taxRateBps: 2_100 }] },
    { supplierKey: 'seguro', prefix: 'POL-', category: 'insurance', everyMonths: 12, dayOfMonth: 9, withholdingRateBps: 0, lines: () => [{ description: 'Prima anual del seguro de garaje y responsabilidad civil', unitPriceMinor: 186_000, taxRateBps: 0 }] },
  ],
};

export const DEMO_GENERATED_CLIENTS: DemoGestoriaClientCompany[] = [espiga, ruedas];
