// A map of the Spanish tax and invoicing landscape for the assistant. It is NOT the source of truth for figures:
// rates, thresholds and deadlines change every year (the yearly figures the app computes with live in the server
// `spain.tax-rules.ts`). This reference holds what is structurally stable (which model, who files it, what law
// backs it) and flags what the assistant MUST verify online before answering, against the official domains below.

export const TAX_KNOWLEDGE_AS_OF = '2026-10-14';

// Official domains the assistant may trust when it searches the web
export const SPANISH_OFFICIAL_DOMAINS = [
  'agenciatributaria.gob.es',
  'sede.agenciatributaria.gob.es',
  'hacienda.gob.es',
  'petete.tributos.hacienda.gob.es',
  'boe.es',
  'seg-social.es',
  'sede.seg-social.gob.es',
  'inclusion.gob.es',
  'ec.europa.eu',
  'eur-lex.europa.eu',
] as const;

export const TAX_TOPICS = [
  'iva',
  'irpf_autonomos',
  'retenciones',
  'impuesto_sociedades',
  'modelos_y_plazos',
  'facturacion',
  'verifactu_y_factura_electronica',
  'seguridad_social_autonomos',
  'gastos_deducibles',
  'operaciones_internacionales',
  'alta_censo_y_obligaciones',
  'conservacion_y_morosidad',
  'territorios_y_regimenes_especiales',
] as const;

export type TaxTopic = typeof TAX_TOPICS[number];

export type TaxKnowledgeEntry = {
  topic: TaxTopic;
  title: string;
  /** What is stable enough to state without searching */
  knownRules: string[];
  /** Laws and regulations that back it, by name, for citing and for searching */
  legalBasis: string[];
  /** How often it changes: decides whether the assistant may answer from this entry alone */
  volatility: 'stable' | 'changes_yearly' | 'in_flux';
  /** What to check online before stating it as current */
  verifyOnline: string[];
};

export const SPANISH_TAX_KNOWLEDGE: readonly TaxKnowledgeEntry[] = [
  {
    topic: 'iva',
    title: 'IVA (impuesto sobre el valor añadido)',
    knownRules: [
      'Península y Baleares: tipo general 21%, reducido 10%, superreducido 4%, y exento en ciertas operaciones (sanidad, educación, seguros, alquiler de vivienda...). Algunos productos y periodos tienen medidas temporales.',
      'Se autoliquida: IVA repercutido (facturas emitidas) menos IVA soportado deducible (facturas recibidas). Modelo 303, trimestral (mensual para grandes empresas y REDEME). Resumen anual: modelo 390.',
      'Solo es deducible el IVA de gastos afectos a la actividad, con factura completa a nombre de la empresa o autónomo.',
      'El recargo de equivalencia (comercio minorista) sustituye la declaración de IVA del minorista: no presenta 303 ni repercute IVA con recargo en sus ventas.',
    ],
    legalBasis: ['Ley 37/1992 del IVA', 'Real Decreto 1624/1992 (Reglamento del IVA)'],
    volatility: 'changes_yearly',
    verifyOnline: ['tipos aplicables a un producto o servicio concreto', 'medidas temporales de rebaja de tipos', 'umbrales de periodo mensual o trimestral'],
  },
  {
    topic: 'irpf_autonomos',
    title: 'IRPF de autónomos y pagos fraccionados',
    knownRules: [
      'El autónomo tributa por IRPF por su rendimiento neto (ingresos menos gastos deducibles). Métodos: estimación directa simplificada, directa normal o módulos (objetiva).',
      'Directa (simplificada o normal): pago fraccionado trimestral con el modelo 130, un porcentaje del rendimiento neto acumulado del año menos lo ya pagado y las retenciones soportadas. En módulos se presenta el modelo 131.',
      'Quien tiene la gran mayoría de sus ingresos con retención en factura (profesionales) puede quedar exento de presentar el 130: comprobar el umbral vigente.',
      'La declaración anual de la renta es el modelo 100, en campaña de primavera (abril a finales de junio).',
      'En directa simplificada existe un gasto de difícil justificación como porcentaje con tope anual.',
    ],
    legalBasis: ['Ley 35/2006 del IRPF', 'Real Decreto 439/2007 (Reglamento del IRPF)'],
    volatility: 'changes_yearly',
    verifyOnline: ['porcentaje de pago fraccionado y gastos de difícil justificación del año', 'límites para estimación directa simplificada y módulos', 'fechas de la campaña de renta'],
  },
  {
    topic: 'retenciones',
    title: 'Retenciones e ingresos a cuenta',
    knownRules: [
      'Un profesional que factura a otro empresario o profesional retiene IRPF en su factura (tipo general 15%; reducido para inicio de actividad durante el año de alta y los dos siguientes). Las facturas a particulares no llevan retención.',
      'Quien paga a profesionales, trabajadores o alquileres de local retiene e ingresa: modelo 111 (trabajo y profesionales), modelo 115 (alquileres de inmuebles urbanos), trimestrales. Resúmenes anuales: 190 y 180 en enero.',
      'La retención soportada por el autónomo se descuenta en su pago fraccionado (130) y en la renta.',
    ],
    legalBasis: ['Ley 35/2006 del IRPF, art. 101', 'Real Decreto 439/2007'],
    volatility: 'changes_yearly',
    verifyOnline: ['tipos de retención vigentes (profesionales, alquileres, rendimientos del capital)', 'condiciones del tipo reducido de inicio de actividad'],
  },
  {
    topic: 'impuesto_sociedades',
    title: 'Impuesto sobre Sociedades',
    knownRules: [
      'Las sociedades (SL, SA...) tributan por el modelo 200, en los 25 días naturales posteriores a los seis meses siguientes al cierre del ejercicio (julio para el año natural).',
      'Pagos fraccionados: modelo 202 en abril, octubre y diciembre, primeros 20 días.',
      'El tipo general es 25% con tipos reducidos para microempresas, empresas de reducida dimensión y entidades de nueva creación: comprobar el vigente.',
      'Los socios-administradores no tributan en el modelo 130; sus retribuciones y dividendos tributan en su IRPF.',
    ],
    legalBasis: ['Ley 27/2014 del Impuesto sobre Sociedades'],
    volatility: 'changes_yearly',
    verifyOnline: ['tipos reducidos vigentes', 'modalidades y porcentajes del modelo 202', 'obligación de presentar cuentas anuales en el Registro Mercantil'],
  },
  {
    topic: 'modelos_y_plazos',
    title: 'Calendario de modelos habituales',
    knownRules: [
      'Trimestrales, 1 a 20 del mes siguiente al trimestre (abril, julio, octubre) y para el cuarto trimestre normalmente hasta el 30 de enero (el 303 y el 130 hasta el 30; el 111 y 115 hasta el 20): 303, 130, 111, 115.',
      'Enero: 390, 190, 180. Febrero: 347 (operaciones con terceros superiores al umbral anual). Primavera: 100. Julio: 200. Abril, octubre y diciembre: 202. Enero a marzo: 720 (bienes en el extranjero).',
      'Si el último día cae en sábado, domingo o festivo, el plazo se traslada al siguiente día hábil. Domiciliar el pago acorta el plazo unos días.',
      'La app calcula el plazo de cada modelo trimestral en la estimación de impuestos: úsala (get_quarterly_taxes) en lugar de calcular fechas a mano.',
    ],
    legalBasis: ['Órdenes ministeriales de cada modelo', 'Calendario del contribuyente de la AEAT'],
    volatility: 'changes_yearly',
    verifyOnline: ['calendario del contribuyente del año en curso', 'días festivos que mueven un plazo'],
  },
  {
    topic: 'facturacion',
    title: 'Reglas de facturación',
    knownRules: [
      'La factura completa lleva: número (y serie), fecha de expedición, nombre o razón social, NIF y domicilio de emisor y receptor, descripción de la operación, base imponible, tipo y cuota de IVA, y fecha de la operación si es distinta.',
      'La numeración es correlativa dentro de cada serie, sin saltos. Una factura emitida no se borra ni se edita: se corrige con una factura rectificativa (serie propia).',
      'La factura simplificada (ticket) se permite por importes bajos y en ciertos sectores, sin datos del receptor: comprobar el límite.',
      'Plazo de expedición: en el momento de la operación, o antes del día 16 del mes siguiente cuando el cliente es empresario o profesional.',
      'Hay inversión del sujeto pasivo en ciertas operaciones (por ejemplo, servicios a empresas de otros países de la UE): la factura va sin IVA con la mención correspondiente.',
    ],
    legalBasis: ['Real Decreto 1619/2012 (Reglamento de facturación)', 'Ley 37/1992 del IVA'],
    volatility: 'stable',
    verifyOnline: ['importe límite de la factura simplificada', 'menciones obligatorias en operaciones especiales'],
  },
  {
    topic: 'verifactu_y_factura_electronica',
    title: 'Verifactu y factura electrónica',
    knownRules: [
      'La normativa antifraude obliga a que el software de facturación garantice integridad, trazabilidad e inalterabilidad de los registros. Verifactu es el modo en que cada factura se envía a la AEAT en el momento de emitirse; la alternativa es un sistema no verificable con registro y firma propios.',
      'Las facturas con Verifactu llevan un código QR y la leyenda de factura verificable.',
      'La factura electrónica entre empresas (Ley Crea y Crece) está pendiente de su desarrollo reglamentario.',
    ],
    legalBasis: ['Ley 11/2021 antifraude', 'Real Decreto 1007/2023 (sistemas informáticos de facturación)', 'Orden HAC/1177/2024', 'Ley 18/2022 Crea y Crece'],
    volatility: 'in_flux',
    verifyOnline: ['fechas de obligatoriedad (se han aplazado varias veces) para sociedades y para autónomos', 'especificaciones técnicas vigentes', 'estado del reglamento de factura electrónica B2B'],
  },
  {
    topic: 'seguridad_social_autonomos',
    title: 'Seguridad Social del autónomo (RETA)',
    knownRules: [
      'El autónomo cotiza en el RETA. Desde 2023 la cuota depende de sus rendimientos netos reales por tramos, con regularización posterior según la declaración de la renta.',
      'La cuota se paga mensualmente (último día hábil del mes) y es independiente de los impuestos trimestrales.',
      'Existen bonificaciones para nuevas altas (tarifa plana) con duración y requisitos propios.',
    ],
    legalBasis: ['Real Decreto-ley 13/2022', 'Texto refundido de la Ley General de la Seguridad Social'],
    volatility: 'changes_yearly',
    verifyOnline: ['tabla de tramos y cuotas del año', 'condiciones y duración de la tarifa plana', 'bases mínimas y máximas'],
  },
  {
    topic: 'gastos_deducibles',
    title: 'Gastos deducibles',
    knownRules: [
      'Para deducir un gasto debe estar vinculado a la actividad, justificado con factura y registrado en el periodo. Sin factura completa a nombre del titular normalmente no se deduce el IVA.',
      'Los bienes de uso mixto (vehículo, vivienda) se deducen solo en la parte afecta, con reglas estrictas: el vehículo requiere afectación exclusiva salvo excepciones, y en suministros de la vivienda solo una parte proporcional.',
      'Los gastos de manutención solo son deducibles con condiciones (pago electrónico, establecimiento de restauración, ámbito de la actividad) y con límites diarios.',
      'En la app, cada línea de una factura recibida tiene un porcentaje deducible para reflejar la parte afecta.',
    ],
    legalBasis: ['Ley 35/2006 del IRPF, arts. 28 y 30', 'Ley 37/1992 del IVA, arts. 95 y 96'],
    volatility: 'changes_yearly',
    verifyOnline: ['reglas de deducción de vehículos y suministros', 'límites de dietas y manutención', 'criterios de la Dirección General de Tributos para gastos concretos'],
  },
  {
    topic: 'operaciones_internacionales',
    title: 'Operaciones con la UE y terceros países',
    knownRules: [
      'Entregas y servicios entre empresas de la UE normalmente van sin IVA con inversión del sujeto pasivo; hay que estar en el ROI y validar el NIF-IVA del cliente en VIES. Se declaran en el modelo 349.',
      'Las exportaciones fuera de la UE están exentas de IVA con justificación aduanera. Las importaciones tributan en aduana.',
      'Las ventas a particulares de otros países UE de bienes y servicios digitales pueden tributar en destino (ventanilla única OSS).',
    ],
    legalBasis: ['Ley 37/1992 del IVA', 'Directiva 2006/112/CE'],
    volatility: 'changes_yearly',
    verifyOnline: ['umbrales de ventas a distancia y OSS', 'tratamiento de un servicio concreto según el país del cliente'],
  },
  {
    topic: 'alta_censo_y_obligaciones',
    title: 'Alta de actividad y obligaciones formales',
    knownRules: [
      'El alta como autónomo implica el alta censal en Hacienda (modelos 036 o 037) y el alta en el RETA. Las modificaciones y la baja también se comunican por el modelo 036.',
      'Las personas físicas están exentas del IAE; las sociedades solo lo pagan si su facturación supera el umbral legal.',
      'Las sociedades además deben llevar contabilidad según el Código de Comercio y depositar las cuentas anuales en el Registro Mercantil.',
    ],
    legalBasis: ['Real Decreto 1065/2007', 'Código de Comercio'],
    volatility: 'stable',
    verifyOnline: ['umbral de exención del IAE', 'plazos de depósito de cuentas'],
  },
  {
    topic: 'conservacion_y_morosidad',
    title: 'Conservación de documentos y plazos de pago',
    knownRules: [
      'Las facturas y justificantes se conservan como mínimo durante el plazo de prescripción tributaria (4 años); la contabilidad mercantil, 6 años. Algunas operaciones (inmuebles) tienen plazos mayores.',
      'La ley de morosidad fija un plazo máximo de pago de 30 días, ampliable por pacto hasta 60, con interés de demora automático si se supera.',
    ],
    legalBasis: ['Ley General Tributaria', 'Código de Comercio, art. 30', 'Ley 3/2004 de lucha contra la morosidad'],
    volatility: 'stable',
    verifyOnline: ['plazos de conservación en operaciones inmobiliarias', 'tipo de interés de demora vigente'],
  },
  {
    topic: 'territorios_y_regimenes_especiales',
    title: 'Territorios y regímenes especiales',
    knownRules: [
      'Todo lo anterior es territorio común. Navarra y País Vasco tienen haciendas forales con normas y modelos propios. Canarias aplica IGIC en lugar de IVA y Ceuta y Melilla el IPSI.',
      'Hay regímenes especiales de IVA (recargo de equivalencia, agricultura, ganadería y pesca, criterio de caja, agencias de viajes, bienes usados) con reglas propias.',
    ],
    legalBasis: ['Convenio Económico con Navarra', 'Concierto Económico con el País Vasco', 'Ley 20/1991 (IGIC)'],
    volatility: 'changes_yearly',
    verifyOnline: ['hacienda foral aplicable y sus modelos', 'condiciones de cada régimen especial'],
  },
];

export function getTaxKnowledge({ topics }: { topics?: readonly TaxTopic[] } = {}) {
  const entries = topics === undefined || topics.length === 0
    ? SPANISH_TAX_KNOWLEDGE
    : SPANISH_TAX_KNOWLEDGE.filter(entry => topics.includes(entry.topic));

  return {
    asOf: TAX_KNOWLEDGE_AS_OF,
    entries,
    officialDomains: SPANISH_OFFICIAL_DOMAINS,
    guidance: [
      'This reference is a map, not the current law. Figures, rates, thresholds and deadlines change: whenever an answer depends on them, or the entry is flagged "changes_yearly" or "in_flux", verify with a web search restricted to the official domains and cite the source.',
      'It describes territorio común. If the user is in Navarra, País Vasco, Canarias, Ceuta or Melilla, say so and search their specific rules.',
      'You give orientation, not tax advice with legal liability: for decisions with large consequences recommend confirming with a gestor or asesor fiscal.',
    ],
  };
}
