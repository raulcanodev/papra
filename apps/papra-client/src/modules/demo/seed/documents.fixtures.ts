import type { DemoDocumentFixture } from './fixtures.types';

// Documents a small Spanish design and web studio keeps: contracts, quotes, tax receipts, insurance, bank papers.
// Built from the visit date so periods, quarters and deadlines are always current. Fictional data only.
export function buildDemoDocumentFixtures({ now }: { now: Date }): DemoDocumentFixture[] {
  const year = now.getFullYear();
  const currentQuarter = Math.floor(now.getMonth() / 3) + 1;
  const lastQuarter = currentQuarter === 1 ? 4 : currentQuarter - 1;
  const lastQuarterYear = currentQuarter === 1 ? year - 1 : year;
  const daysSinceQuarterEnd = Math.max(5, Math.round((now.getTime() - new Date(year, (currentQuarter - 1) * 3, 1).getTime()) / 86_400_000) - 12);

  return [
    {
      name: 'Escritura de constitución de Acme SL',
      daysAgo: 720,
      title: 'Escritura de constitución de sociedad limitada',
      lines: ['Sociedad: Acme SL', 'CIF: B00000000', 'Domicilio social: Calle de Ejemplo 28, 4ºB, 28013 Madrid', 'Objeto social: diseño gráfico, desarrollo de software y consultoría digital', 'Capital social: 3.000 euros, totalmente desembolsado', 'Administradora única: Lucía Martín'],
      tags: ['Contratos'],
      folder: { manual: 'Contratos' },
      customProperties: [{ key: 'confidential', value: true }, { key: 'reference', value: 'Protocolo 1.284' }, { key: 'status', value: 'reviewed' }],
    },
    {
      name: 'Contrato de puesto en Espacio Coworking Malasaña',
      daysAgo: 400,
      title: 'Contrato de cesión de puesto de trabajo',
      lines: ['Arrendador: Espacio Coworking Malasaña SL (B00000012)', 'Arrendatario: Acme SL (B00000000)', 'Objeto: dos puestos fijos y uso de sala de reuniones', 'Renta mensual: 350,00 euros + IVA, con retención del 19% de IRPF', 'Duración: un año prorrogable tácitamente', 'Fianza: una mensualidad'],
      tags: ['Contratos'],
      folder: { manual: 'Contratos' },
      customProperties: [{ key: 'amount', value: 350 }, { key: 'reference', value: 'CW-0042' }, { key: 'status', value: 'reviewed' }],
    },
    {
      name: 'Contrato marco de servicios con Estudio Lumen',
      daysAgo: 310,
      title: 'Contrato marco de prestación de servicios',
      lines: ['Cliente: Estudio Lumen SL (B00000001)', 'Proveedor: Acme SL (B00000000)', 'Servicios: diseño de identidad, desarrollo web y mantenimiento', 'Tarifa: 65 euros por hora de desarrollo, mantenimiento 45 euros al mes', 'Facturación mensual con pago a 30 días', 'Confidencialidad durante la relación y dos años después'],
      tags: ['Contratos'],
      folder: { manual: 'Contratos' },
      customProperties: [{ key: 'confidential', value: true }, { key: 'status', value: 'reviewed' }],
    },
    {
      name: 'Acuerdo de confidencialidad con Talleres del Norte',
      daysAgo: 190,
      title: 'Acuerdo de confidencialidad (NDA)',
      lines: ['Partes: Talleres del Norte SA (A00000002) y Acme SL (B00000000)', 'Información protegida: planos, procesos de producción y datos de clientes', 'Duración: tres años desde la firma', 'Jurisdicción: juzgados de Bilbao'],
      tags: ['Contratos'],
      folder: { manual: 'Contratos' },
      customProperties: [{ key: 'confidential', value: true }],
    },
    {
      name: 'Presupuesto web para Verde Mercado Cooperativa',
      daysAgo: 9,
      title: 'Presupuesto PRE-0031',
      lines: ['Cliente: Verde Mercado Cooperativa (F00000005)', '3 sesiones de consultoría estratégica: 540,00 euros', 'IVA 21%: 113,40 euros', 'Total: 653,40 euros', 'Validez: 30 días'],
      tags: ['Presupuestos'],
      customProperties: [{ key: 'amount', value: 653.4 }, { key: 'status', value: 'pending' }, { key: 'reference', value: 'PRE-0031' }],
    },
    {
      name: 'Presupuesto de catering para Bruma Café',
      daysAgo: 21,
      title: 'Presupuesto PRE-0030',
      lines: ['Cliente: Bruma Café (B00000003)', '2 servicios de catering para evento corporativo: 700,00 euros', 'IVA 10%: 70,00 euros', 'Total: 770,00 euros', 'Aceptado por el cliente, pendiente de facturar'],
      tags: ['Presupuestos'],
      customProperties: [{ key: 'amount', value: 770 }, { key: 'status', value: 'reviewed' }, { key: 'reference', value: 'PRE-0030' }],
    },
    {
      name: 'Póliza de responsabilidad civil profesional',
      daysAgo: 160,
      title: 'Póliza de responsabilidad civil profesional',
      lines: ['Aseguradora: Seguros Ejemplo SA (A00000014)', 'Tomador: Acme SL', 'Suma asegurada: 300.000 euros por siniestro', 'Prima anual: 420,00 euros (exenta de IVA)', 'Renovación anual automática'],
      tags: ['Seguros'],
      folder: { manual: 'Seguros' },
      customProperties: [{ key: 'reference', value: 'POL-RC-77812' }, { key: 'amount', value: 420 }, { key: 'due_date', value: { daysFromNow: 205 } }],
    },
    {
      name: `Justificante modelo 303 · ${lastQuarter}T ${lastQuarterYear}`,
      daysAgo: daysSinceQuarterEnd,
      title: `Modelo 303 · Autoliquidación de IVA · ${lastQuarter}T ${lastQuarterYear}`,
      lines: ['Agencia Tributaria · Justificante de presentación', 'NIF: B00000000 · Acme SL', `Periodo: ${lastQuarter}T ${lastQuarterYear}`, 'Resultado: a ingresar', 'Forma de pago: domiciliación bancaria', 'Presentado por: Gestoría Martínez y Asociados'],
      tags: ['Impuestos'],
      folder: { manual: 'Impuestos' },
      customProperties: [{ key: 'status', value: 'sent_to_accountant' }, { key: 'reference', value: `303-${lastQuarterYear}-${lastQuarter}T` }],
    },
    {
      name: `Justificante modelos 111 y 115 · ${lastQuarter}T ${lastQuarterYear}`,
      daysAgo: daysSinceQuarterEnd,
      title: `Modelos 111 y 115 · Retenciones · ${lastQuarter}T ${lastQuarterYear}`,
      lines: ['Agencia Tributaria · Justificante de presentación', 'Modelo 111: retenciones de profesionales (gestoría)', 'Modelo 115: retenciones del alquiler del coworking', `Periodo: ${lastQuarter}T ${lastQuarterYear}`],
      tags: ['Impuestos'],
      folder: { manual: 'Impuestos' },
      customProperties: [{ key: 'status', value: 'sent_to_accountant' }],
    },
    {
      name: `Impuesto sobre Sociedades · ejercicio ${year - 1}`,
      daysAgo: Math.max(30, Math.round((now.getTime() - new Date(year, 6, 20).getTime()) / 86_400_000)),
      title: `Modelo 200 · Impuesto sobre Sociedades · ejercicio ${year - 1}`,
      lines: ['Agencia Tributaria · Declaración anual', 'NIF: B00000000 · Acme SL', `Ejercicio: ${year - 1}`, 'Cuota íntegra: 12.500,00 euros', 'Base para los pagos fraccionados del modelo 202'],
      tags: ['Impuestos'],
      folder: { manual: 'Impuestos' },
      customProperties: [{ key: 'amount', value: 12_500 }, { key: 'status', value: 'reviewed' }],
    },
    {
      name: 'Certificado de estar al corriente con Hacienda',
      daysAgo: 48,
      title: 'Certificado de estar al corriente de obligaciones tributarias',
      lines: ['Agencia Tributaria certifica que Acme SL (B00000000)', 'se encuentra al corriente de sus obligaciones tributarias', 'a efectos de contratación con el sector público', 'Validez: doce meses desde su emisión'],
      tags: ['Impuestos'],
      folder: { manual: 'Impuestos' },
      customProperties: [{ key: 'due_date', value: { daysFromNow: 317 } }],
    },
    {
      name: 'Certificado de titularidad de cuenta',
      daysAgo: 600,
      title: 'Certificado de titularidad bancaria',
      lines: ['Banco Ejemplo SA certifica que la cuenta', 'IBAN ES00 0000 0000 0000 0000 0000 (dato de ejemplo)', 'es titularidad de Acme SL (B00000000)'],
      tags: ['Banco'],
      folder: { manual: 'Banco' },
    },
    {
      name: 'Extracto bancario del mes pasado',
      daysAgo: Math.max(2, now.getDate() - 1),
      title: 'Extracto de cuenta corriente',
      lines: ['Banco Ejemplo SA · Cuenta de empresa', 'Cobros de clientes, cuota del coworking, gestoría y tarjeta', 'Comisión de mantenimiento: 8,00 euros'],
      tags: ['Banco'],
      folder: { manual: 'Banco' },
      customProperties: [{ key: 'status', value: 'pending' }],
    },
  ];
}
