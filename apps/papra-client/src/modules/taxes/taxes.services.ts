import type { AsDto } from '../shared/http/http-client.types';
import type { Quarter, QuarterlyTaxReport, SimulatedPurchase } from './taxes.types';
import { apiClient } from '../shared/http/api-client';

const basePath = ({ organizationId, year, quarter }: { organizationId: string; year: number; quarter: Quarter }) => `/api/organizations/${organizationId}/taxes/${year}/${quarter}`;

export function toReport(dto: AsDto<QuarterlyTaxReport>): QuarterlyTaxReport {
  const report = dto as unknown as QuarterlyTaxReport;

  return {
    ...report,
    period: { start: new Date(dto.period.start), end: new Date(dto.period.end) },
    corporateTax202: report.corporateTax202.map(instalment => ({ ...instalment, dueDate: new Date(instalment.dueDate) })),
    deadlines: report.deadlines.map(deadline => ({ ...deadline, dueDate: new Date(deadline.dueDate) })),
  };
}

export async function fetchQuarterlyTaxReport({ organizationId, year, quarter, simulatedPurchase }: { organizationId: string; year: number; quarter: Quarter; simulatedPurchase?: SimulatedPurchase }) {
  const { report } = await apiClient<{ report: AsDto<QuarterlyTaxReport> }>({
    path: basePath({ organizationId, year, quarter }),
    method: 'GET',
    query: simulatedPurchase
      ? { simulateBaseMinor: simulatedPurchase.baseMinor, simulateTaxRateBps: simulatedPurchase.taxRateBps, simulateDeductibleRateBps: simulatedPurchase.deductibleRateBps, simulateCategory: simulatedPurchase.category }
      : undefined,
  });

  return { report: toReport(report) };
}

export async function downloadAccountantPack({ organizationId, year, quarter }: { organizationId: string; year: number; quarter: Quarter }) {
  const blob = await apiClient({ path: `${basePath({ organizationId, year, quarter })}/export`, method: 'GET', responseType: 'blob' });

  return { blob, fileName: `${year}-${quarter}T-documentacion-gestor.zip` };
}

export async function sendAccountantPack({ organizationId, year, quarter, to, saveAsAccountantEmail }: { organizationId: string; year: number; quarter: Quarter; to: string; saveAsAccountantEmail: boolean }) {
  return apiClient<{ recipient: string; skippedDocumentsCount: number }>({ path: `${basePath({ organizationId, year, quarter })}/send`, method: 'POST', body: { to, saveAsAccountantEmail } });
}
