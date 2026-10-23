import type { Database } from '../app/database/database.types';
import type { DocumentStorageService } from '../documents/storage/documents.storage.services';
import type { ExpenseCategory } from '../purchases/purchases.constants';
import type { buildQuarterlyTaxReport } from './taxes.usecases';
import { Buffer } from 'node:buffer';
import { and, eq, inArray } from 'drizzle-orm';
import JSZip from 'jszip';
import PDFDocument from 'pdfkit';
import { documentsTable } from '../documents/documents.table';
import { getEquivalenceSurchargeRateBps, getLineAmounts, getLineEquivalenceSurchargeMinor } from '../invoicing/invoicing.models';
import { collectStreamToFile } from '../shared/streams/stream.convertion';

type QuarterlyTaxData = Awaited<ReturnType<typeof buildQuarterlyTaxReport>>;

// The accountant works in Spanish: the books follow the columns of the AEAT VAT books model, in a CSV Excel opens as is
const EXPENSE_CATEGORY_LABELS: Record<ExpenseCategory, string> = {
  goods: 'Mercaderías y compras',
  supplies: 'Suministros',
  rent: 'Arrendamientos',
  professional_services: 'Servicios profesionales',
  software: 'Software y suscripciones',
  marketing: 'Publicidad y marketing',
  travel: 'Viajes y dietas',
  vehicle: 'Vehículos y combustible',
  insurance: 'Seguros',
  bank_fees: 'Servicios bancarios',
  taxes_and_fees: 'Tributos',
  other: 'Otros gastos',
};

// Documents attached to an emailed pack stay under the email provider limits, beyond they are only in the download
export const MAX_EMAILED_DOCUMENTS_SIZE_BYTES = 25 * 1024 * 1024;

const formatAmount = (minor: number) => (minor / 100).toFixed(2).replace('.', ',');
const formatRate = (bps: number) => String(bps / 100).replace('.', ',');
const formatDate = (date: Date) => `${String(date.getUTCDate()).padStart(2, '0')}/${String(date.getUTCMonth() + 1).padStart(2, '0')}/${date.getUTCFullYear()}`;
const escapeCell = (value: string) => (/[;"\n\r]/.test(value) ? `"${value.replace(/"/g, '""')}"` : value);

// Makes Excel read the file as UTF-8 (accents, ñ)
const UTF8_BOM = String.fromCharCode(0xFEFF);

export function toCsv({ header, rows }: { header: string[]; rows: (string | number)[][] }) {
  return `${UTF8_BOM}${[header, ...rows].map(row => row.map(cell => escapeCell(String(cell))).join(';')).join('\r\n')}\r\n`;
}

function groupLinesByRate<T extends { taxRateBps: number; quantityMillis: number; unitPriceMinor: number; discountRateBps: number }>(items: T[], extra: (item: T, taxMinor: number) => number = () => 0) {
  const byRate = new Map<number, { baseMinor: number; taxMinor: number; extraMinor: number }>();

  for (const item of items) {
    const { netMinor, taxMinor } = getLineAmounts(item);
    const current = byRate.get(item.taxRateBps) ?? { baseMinor: 0, taxMinor: 0, extraMinor: 0 };
    byRate.set(item.taxRateBps, { baseMinor: current.baseMinor + netMinor, taxMinor: current.taxMinor + taxMinor, extraMinor: current.extraMinor + extra(item, taxMinor) });
  }

  return [...byRate.entries()].toSorted(([a], [b]) => b - a);
}

// One row per invoice and VAT rate, as the official book splits it
export function buildIssuedInvoicesBook({ data }: { data: QuarterlyTaxData }) {
  const { report } = data;
  const rows = data.issuedInvoices
    .filter(({ issueDate }) => issueDate >= report.period.start)
    .flatMap(invoice => groupLinesByRate(invoice.items, item => (invoice.equivalenceSurcharge ? getLineEquivalenceSurchargeMinor({ netMinor: getLineAmounts(item).netMinor, taxRateBps: item.taxRateBps }) : 0)).map(([rateBps, { baseMinor, taxMinor, extraMinor }], index) => [
      report.year,
      `${report.quarter}T`,
      formatDate(invoice.issueDate),
      invoice.number ?? '',
      invoice.customerTaxId ?? '',
      invoice.customerName,
      formatAmount(baseMinor),
      formatRate(rateBps),
      formatAmount(taxMinor),
      invoice.equivalenceSurcharge ? formatRate(getEquivalenceSurchargeRateBps({ taxRateBps: rateBps })) : '',
      invoice.equivalenceSurcharge ? formatAmount(extraMinor) : '',
      // The withholding and the total are invoice level figures, written once on its first row
      index === 0 ? formatRate(invoice.withholdingRateBps) : '',
      index === 0 ? formatAmount(invoice.withholdingMinor) : '',
      index === 0 ? formatAmount(invoice.totalMinor) : '',
    ]));

  return toCsv({
    header: ['Ejercicio', 'Periodo', 'Fecha expedición', 'Número factura', 'NIF destinatario', 'Nombre destinatario', 'Base imponible', 'Tipo IVA %', 'Cuota IVA repercutida', 'Tipo recargo eq. %', 'Cuota recargo eq.', 'Tipo retención %', 'Retención IRPF', 'Total factura'],
    rows,
  });
}

export function buildReceivedInvoicesBook({ data }: { data: QuarterlyTaxData }) {
  const { report } = data;
  const rows = data.purchaseInvoices
    .filter(({ issueDate }) => issueDate >= report.period.start)
    .flatMap(purchaseInvoice => groupLinesByRate(purchaseInvoice.items, (item, taxMinor) => Math.round(taxMinor * item.deductibleRateBps / 10_000)).map(([rateBps, { baseMinor, taxMinor, extraMinor }], index) => [
      report.year,
      `${report.quarter}T`,
      formatDate(purchaseInvoice.issueDate),
      purchaseInvoice.number,
      purchaseInvoice.supplierTaxId ?? '',
      purchaseInvoice.supplierName,
      EXPENSE_CATEGORY_LABELS[purchaseInvoice.category],
      formatAmount(baseMinor),
      formatRate(rateBps),
      formatAmount(taxMinor),
      formatAmount(extraMinor),
      index === 0 ? formatRate(purchaseInvoice.withholdingRateBps) : '',
      index === 0 ? formatAmount(purchaseInvoice.withholdingMinor) : '',
      index === 0 ? formatAmount(purchaseInvoice.totalMinor) : '',
    ]));

  return toCsv({
    header: ['Ejercicio', 'Periodo', 'Fecha factura', 'Número factura', 'NIF emisor', 'Nombre emisor', 'Categoría gasto', 'Base imponible', 'Tipo IVA %', 'Cuota IVA soportada', 'Cuota deducible', 'Tipo retención %', 'Retención IRPF', 'Total factura'],
    rows,
  });
}

export async function buildSummaryPdf({ data, organizationName }: { data: QuarterlyTaxData; organizationName: string }): Promise<Buffer> {
  const { report } = data;
  const doc = new PDFDocument({ size: 'A4', margin: 48, info: { Title: `Resumen ${report.quarter}T ${report.year}`, CreationDate: new Date(0) } });
  const chunks: Buffer[] = [];
  doc.on('data', (chunk: Buffer) => chunks.push(chunk));
  const done = new Promise<Buffer>(resolve => doc.on('end', () => resolve(Buffer.concat(chunks))));

  const money = (minor: number) => `${formatAmount(minor)} ${report.currency}`;
  const row = (label: string, value: string, { bold = false } = {}) => {
    doc.font(bold ? 'Helvetica-Bold' : 'Helvetica').fontSize(10).fillColor('#111827').text(label, 48, doc.y, { continued: false, width: 340 });
    doc.moveUp().text(value, 390, doc.y, { width: 157, align: 'right' });
    doc.moveDown(0.3);
  };
  const section = (title: string) => {
    doc.moveDown(0.8).font('Helvetica-Bold').fontSize(12).fillColor('#111827').text(title, 48);
    doc.moveDown(0.3);
  };

  doc.font('Helvetica-Bold').fontSize(18).text(`Resumen fiscal ${report.quarter}T ${report.year}`);
  doc.font('Helvetica').fontSize(10).fillColor('#6b7280').text(organizationName);
  doc.text(`${report.counts.issuedInvoices} facturas emitidas · ${report.counts.purchaseInvoices} facturas recibidas`);

  if (report.applicable[303]) {
    section('IVA · Modelo 303');
    for (const { rateBps, baseMinor, taxMinor } of report.vat303.output) {
      row(`Base al ${formatRate(rateBps)}% (cuota ${money(taxMinor)})`, money(baseMinor));
    }
    row('IVA repercutido', money(report.vat303.outputTaxMinor));
    if (report.vat303.outputEquivalenceSurchargeMinor > 0) {
      row('Recargo de equivalencia repercutido', money(report.vat303.outputEquivalenceSurchargeMinor));
    }
    row('IVA soportado deducible', `-${money(report.vat303.deductibleTaxMinor)}`);
    row('Resultado', money(report.vat303.resultMinor), { bold: true });
  }

  if (report.applicable[130]) {
    section('IRPF · Modelo 130 (acumulado del año)');
    row('Ingresos', money(report.incomeTax130.incomeMinor));
    row('Gastos', `-${money(report.incomeTax130.expensesMinor)}`);
    row('Gastos de difícil justificación', `-${money(report.incomeTax130.difficultExpensesMinor)}`);
    row('Rendimiento neto', money(report.incomeTax130.netIncomeMinor));
    row(`${formatRate(report.incomeTax130.rateBps)}% del rendimiento`, money(report.incomeTax130.grossInstalmentMinor));
    row('Retenciones soportadas', `-${money(report.incomeTax130.withholdingsMinor)}`);
    row('Pagos de trimestres anteriores', `-${money(report.incomeTax130.previousInstalmentsMinor)}`);
    row('Resultado', money(report.incomeTax130.resultMinor), { bold: true });
  }

  if (report.applicable[111]) {
    section('Retenciones a profesionales · Modelo 111');
    row(`Perceptores: ${report.professionals111.payeesCount}, base`, money(report.professionals111.baseMinor));
    row('Retenciones', money(report.professionals111.amountMinor), { bold: true });
  }

  if (report.applicable[115]) {
    section('Retenciones de alquileres · Modelo 115');
    row(`Perceptores: ${report.rents115.payeesCount}, base`, money(report.rents115.baseMinor));
    row('Retenciones', money(report.rents115.amountMinor), { bold: true });
  }

  doc.moveDown(1.5).font('Helvetica').fontSize(8).fillColor('#6b7280').text('Estimación calculada a partir de las facturas registradas en Paqui. No sustituye la revisión de tu gestor: no incluye otros gastos (cuota de autónomos, nóminas, amortizaciones...).', 48, doc.y, { width: 499 });
  doc.end();

  return done;
}

const safeFileName = (value: string) => value.replace(/[^\w.-]+/g, '-').replace(/-+/g, '-').slice(0, 120);

// Everything the accountant needs for the quarter, in one archive
export async function buildAccountantPack({ data, organizationName, organizationId, db, documentsStorageService, maxDocumentsSizeBytes = Number.POSITIVE_INFINITY }: {
  data: QuarterlyTaxData;
  organizationName: string;
  organizationId: string;
  db: Database;
  documentsStorageService: DocumentStorageService;
  maxDocumentsSizeBytes?: number;
}) {
  const { report } = data;
  const prefix = `${report.year}-${report.quarter}T`;
  const zip = new JSZip();

  zip.file(`${prefix}-libro-facturas-emitidas.csv`, buildIssuedInvoicesBook({ data }));
  zip.file(`${prefix}-libro-facturas-recibidas.csv`, buildReceivedInvoicesBook({ data }));
  zip.file(`${prefix}-resumen.pdf`, await buildSummaryPdf({ data, organizationName }));

  const quarterIssued = data.issuedInvoices.filter(({ issueDate }) => issueDate >= report.period.start);
  const quarterPurchases = data.purchaseInvoices.filter(({ issueDate }) => issueDate >= report.period.start);
  const fileNames = new Map<string, string>([
    ...quarterIssued.filter(({ documentId }) => documentId !== null).map(invoice => [invoice.documentId!, `facturas-emitidas/${safeFileName(invoice.number ?? invoice.id)}`] as const),
    ...quarterPurchases.filter(({ documentId }) => documentId !== null).map(purchaseInvoice => [purchaseInvoice.documentId!, `facturas-recibidas/${safeFileName(`${purchaseInvoice.supplierName}-${purchaseInvoice.number}`)}`] as const),
  ]);

  const documents = fileNames.size === 0
    ? []
    : await db.select().from(documentsTable).where(and(eq(documentsTable.organizationId, organizationId), eq(documentsTable.isDeleted, false), inArray(documentsTable.id, [...fileNames.keys()])));

  let includedSizeBytes = 0;
  let skippedDocumentsCount = 0;

  for (const document of documents) {
    if (includedSizeBytes + document.originalSize > maxDocumentsSizeBytes) {
      skippedDocumentsCount += 1;
      continue;
    }

    const { fileStream } = await documentsStorageService.getFileStream({
      storageKey: document.originalStorageKey,
      fileEncryptionAlgorithm: document.fileEncryptionAlgorithm,
      fileEncryptionKekVersion: document.fileEncryptionKekVersion,
      fileEncryptionKeyWrapped: document.fileEncryptionKeyWrapped,
    });
    const { file } = await collectStreamToFile({ fileStream, fileName: document.name, mimeType: document.mimeType });
    const extension = document.name.includes('.') ? document.name.slice(document.name.lastIndexOf('.')) : '';

    zip.file(`${fileNames.get(document.id)}${extension}`, Buffer.from(await file.arrayBuffer()));
    includedSizeBytes += document.originalSize;
  }

  const content = await zip.generateAsync({ type: 'nodebuffer', compression: 'DEFLATE' });

  return { content, fileName: `${prefix}-documentacion-gestor.zip`, skippedDocumentsCount };
}
