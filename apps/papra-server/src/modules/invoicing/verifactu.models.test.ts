import { describe, expect, test } from 'vitest';
import { buildVerifactuHashInput, buildVerifactuQrUrl, calculateVerifactuHash, formatAeatDate, formatAeatTimestamp } from './verifactu.models';

const payload = {
  issuerTaxId: 'B12345678',
  issuerName: 'Jocrimar SL',
  invoiceNumber: 'F-2026-0001',
  issueDate: '13-10-2026',
  invoiceType: 'F1' as const,
  customerName: 'Cliente SL',
  customerTaxId: 'B87654321',
  description: 'Servicio',
  taxAmount: '21.00',
  totalAmount: '121.00',
  previousHash: '',
  generatedAt: '2026-10-13T12:30:00+02:00',
};

describe('vERI*FACTU models', () => {
  test('builds the canonical hash input in the AEAT field order', () => {
    expect(buildVerifactuHashInput(payload)).toBe('IDEmisorFactura=B12345678&NumSerieFactura=F-2026-0001&FechaExpedicionFactura=13-10-2026&TipoFactura=F1&CuotaTotal=21.00&ImporteTotal=121.00&Huella=&FechaHoraHusoGenRegistro=2026-10-13T12:30:00+02:00');
    expect(calculateVerifactuHash(payload)).toMatch(/^[0-9A-F]{64}$/);
    expect(calculateVerifactuHash(payload)).toBe(calculateVerifactuHash(payload));
  });

  test('uses the official test QR endpoint and Spanish date format', () => {
    const url = new URL(buildVerifactuQrUrl({ environment: 'test', issuerTaxId: payload.issuerTaxId, invoiceNumber: payload.invoiceNumber, issueDate: payload.issueDate, totalAmount: payload.totalAmount }));
    expect(url.origin).toBe('https://prewww2.aeat.es');
    expect(url.searchParams.get('numserie')).toBe('F-2026-0001');
    expect(formatAeatDate(new Date('2026-10-13T12:00:00.000Z'))).toBe('13-10-2026');
  });

  test('formats timestamps with the Europe/Madrid daylight-saving offset', () => {
    expect(formatAeatTimestamp(new Date('2026-07-13T10:30:00.000Z'))).toBe('2026-07-13T12:30:00+02:00');
    expect(formatAeatTimestamp(new Date('2026-12-13T10:30:00.000Z'))).toBe('2026-12-13T11:30:00+01:00');
  });
});
