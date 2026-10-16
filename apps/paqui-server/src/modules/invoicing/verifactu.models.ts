import { createHash } from 'node:crypto';

export type VerifactuRecordPayload = {
  issuerTaxId: string;
  issuerName: string;
  invoiceNumber: string;
  issueDate: string;
  invoiceType: 'F1';
  customerName: string;
  customerTaxId: string | null;
  description: string;
  taxAmount: string;
  totalAmount: string;
  previousHash: string;
  generatedAt: string;
};

export function buildVerifactuHashInput(payload: VerifactuRecordPayload) {
  return [
    `IDEmisorFactura=${payload.issuerTaxId}`,
    `NumSerieFactura=${payload.invoiceNumber}`,
    `FechaExpedicionFactura=${payload.issueDate}`,
    `TipoFactura=${payload.invoiceType}`,
    `CuotaTotal=${payload.taxAmount}`,
    `ImporteTotal=${payload.totalAmount}`,
    `Huella=${payload.previousHash}`,
    `FechaHoraHusoGenRegistro=${payload.generatedAt}`,
  ].join('&');
}

export function calculateVerifactuHash(payload: VerifactuRecordPayload) {
  return createHash('sha256').update(buildVerifactuHashInput(payload), 'utf8').digest('hex').toUpperCase();
}

export function buildVerifactuQrUrl({ environment, issuerTaxId, invoiceNumber, issueDate, totalAmount }: { environment: 'test' | 'production'; issuerTaxId: string; invoiceNumber: string; issueDate: string; totalAmount: string }) {
  const baseUrl = environment === 'production'
    ? 'https://www2.agenciatributaria.gob.es/wlpl/TIKE-CONT/ValidarQR'
    : 'https://prewww2.aeat.es/wlpl/TIKE-CONT/ValidarQR';
  const query = new URLSearchParams({ nif: issuerTaxId, numserie: invoiceNumber, fecha: issueDate, importe: totalAmount });
  return `${baseUrl}?${query.toString()}`;
}

export function buildVerifactuXml(payload: VerifactuRecordPayload, hash: string) {
  const previous = payload.previousHash === ''
    ? '<sum:PrimerRegistro>S</sum:PrimerRegistro>'
    : `<sum:RegistroAnterior><sum:Huella>${escapeXml(payload.previousHash)}</sum:Huella></sum:RegistroAnterior>`;
  return `<?xml version="1.0" encoding="UTF-8"?>\n<sum:RegistroAlta xmlns:sum="https://www2.agenciatributaria.gob.es/static_files/common/internet/dep/aplicaciones/es/aeat/tikeV1.0/cont/ws/SuministroInformacion.xsd"><sum:IDVersion>1.0</sum:IDVersion><sum:IDFactura><sum:IDEmisorFactura>${escapeXml(payload.issuerTaxId)}</sum:IDEmisorFactura><sum:NumSerieFactura>${escapeXml(payload.invoiceNumber)}</sum:NumSerieFactura><sum:FechaExpedicionFactura>${payload.issueDate}</sum:FechaExpedicionFactura></sum:IDFactura><sum:NombreRazonEmisor>${escapeXml(payload.issuerName)}</sum:NombreRazonEmisor><sum:TipoFactura>${payload.invoiceType}</sum:TipoFactura><sum:DescripcionOperacion>${escapeXml(payload.description)}</sum:DescripcionOperacion><sum:CuotaTotal>${payload.taxAmount}</sum:CuotaTotal><sum:ImporteTotal>${payload.totalAmount}</sum:ImporteTotal><sum:Encadenamiento>${previous}</sum:Encadenamiento><sum:SistemaInformatico><sum:NombreRazon>Paqui</sum:NombreRazon><sum:NombreSistemaInformatico>Paqui</sum:NombreSistemaInformatico><sum:IdSistemaInformatico>01</sum:IdSistemaInformatico><sum:Version>1.0</sum:Version><sum:NumeroInstalacion>1</sum:NumeroInstalacion><sum:TipoUsoPosibleSoloVerifactu>S</sum:TipoUsoPosibleSoloVerifactu></sum:SistemaInformatico><sum:FechaHoraHusoGenRegistro>${payload.generatedAt}</sum:FechaHoraHusoGenRegistro><sum:TipoHuella>01</sum:TipoHuella><sum:Huella>${hash}</sum:Huella></sum:RegistroAlta>`;
}

export function formatAeatDate(date: Date) {
  return new Intl.DateTimeFormat('en-GB', { day: '2-digit', month: '2-digit', year: 'numeric', timeZone: 'Europe/Madrid' }).format(date).replaceAll('/', '-');
}

export function formatAeatAmount(minor: number) {
  return (minor / 100).toFixed(2);
}

export function formatAeatTimestamp(date: Date) {
  const parts = Object.fromEntries(new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Europe/Madrid',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(date).map(({ type, value }) => [type, value]));
  const localAsUtc = Date.UTC(Number(parts.year), Number(parts.month) - 1, Number(parts.day), Number(parts.hour), Number(parts.minute), Number(parts.second));
  const offsetMinutes = Math.round((localAsUtc - date.getTime()) / 60_000);
  const sign = offsetMinutes >= 0 ? '+' : '-';
  const absoluteOffset = Math.abs(offsetMinutes);
  const offset = `${sign}${String(Math.floor(absoluteOffset / 60)).padStart(2, '0')}:${String(absoluteOffset % 60).padStart(2, '0')}`;
  return `${parts.year}-${parts.month}-${parts.day}T${parts.hour}:${parts.minute}:${parts.second}${offset}`;
}

function escapeXml(value: string) {
  return value.replace(/[&<>"']/g, character => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', '\'': '&apos;' })[character]!);
}
