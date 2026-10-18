import { apiClient } from '@/modules/shared/http/api-client';

export type AiReasoningEffort = 'low' | 'medium' | 'high' | 'max';
export type AiUsageGroupBy = 'feature' | 'organization' | 'user';

export type AiModelOption = {
  id: string;
  provider: string;
  label: string;
  efforts: AiReasoningEffort[];
  prices: { input: number; output: number; cacheRead: number };
};

export type AiSettings = {
  current: { provider: string; model: string; reasoningEffort: AiReasoningEffort | null } | null;
  source: 'admin' | 'environment';
  providers: Array<{ id: string; label: string; isConfigured: boolean }>;
  models: AiModelOption[];
};

export type AiUsageRow = {
  key: string | null;
  label: string | null;
  email?: string | null;
  calls: number;
  errors: number;
  inputTokens: number;
  outputTokens: number;
  costUsdMicros: number;
  unpricedCalls: number;
};

export type AiProviderTotal = {
  provider: string;
  label: string;
  calls: number;
  costUsdMicros: number;
  unpricedCalls: number;
  models: Array<{ model: string; calls: number; costUsdMicros: number }>;
};

export function getAiSettings() {
  return apiClient<AiSettings>({ method: 'GET', path: '/api/admin/ai/settings' });
}

export function saveAiSettings({ model, reasoningEffort }: { model: string; reasoningEffort: AiReasoningEffort | null }) {
  return apiClient<AiSettings>({ method: 'PUT', path: '/api/admin/ai/settings', body: { model, reasoningEffort } });
}

export function getAiUsage(query: { from: string; to: string; groupBy: AiUsageGroupBy; feature?: string; organizationId?: string }) {
  return apiClient<{ rows: AiUsageRow[]; providers: AiProviderTotal[] }>({ method: 'GET', path: '/api/admin/ai/usage', query });
}
