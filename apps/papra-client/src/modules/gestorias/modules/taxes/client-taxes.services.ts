import type { AsDto } from '@/modules/shared/http/http-client.types';
import type { Quarter, QuarterlyTaxReport } from '@/modules/taxes/taxes.types';
import { apiClient } from '@/modules/shared/http/api-client';
import { toReport } from '@/modules/taxes/taxes.services';
import { getGestoriaClientApiPath } from '../../gestorias.services';

type PeriodParams = { gestoriaId: string; organizationId: string; year: number; quarter: Quarter };

const periodPath = ({ gestoriaId, organizationId, year, quarter }: PeriodParams) => `${getGestoriaClientApiPath({ gestoriaId, organizationId })}/taxes/${year}/${quarter}`;

export async function fetchClientQuarterlyTaxReport(params: PeriodParams) {
  const { report } = await apiClient<{ report: AsDto<QuarterlyTaxReport> }>({ method: 'GET', path: periodPath(params) });

  return { report: toReport(report) };
}

/** The same pack the company would send: books of issued and received invoices, summary and files */
export async function downloadClientAccountantPack(params: PeriodParams & { clientName: string }) {
  const blob = await apiClient({ method: 'GET', path: `${periodPath(params)}/export`, responseType: 'blob' });
  const safeName = params.clientName.normalize('NFD').replace(/\p{Diacritic}/gu, '').replace(/[^\w-]+/g, '-').replace(/^-+|-+$/g, '').toLowerCase();

  return { blob, fileName: `${params.year}-${params.quarter}T-${safeName || 'cliente'}.zip` };
}
