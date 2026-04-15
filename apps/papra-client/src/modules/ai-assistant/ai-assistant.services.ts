import { apiClient } from '../shared/http/api-client';
import { buildTimeConfig } from '../config/config';

export type ChatMessage = {
  role: 'user' | 'assistant' | 'system';
  content: string;
};

export type ChatSession = {
  id: string;
  title: string;
  model: string | null;
  createdAt: string;
  updatedAt: string;
};

export type ChatSessionWithMessages = {
  session: ChatSession;
  messages: ChatMessage[];
};

export type AiModel = {
  id: string;
  label: string;
  provider: 'openai' | 'anthropic';
};

export type AiModelsResponse = {
  isConfigured: boolean;
  defaultModel: string;
  providers: string[];
  models: AiModel[];
};

export async function fetchAiModels(): Promise<AiModelsResponse> {
  return apiClient<AiModelsResponse>({ path: '/api/ai/models' });
}

export async function fetchChatSessions({ organizationId }: { organizationId: string }): Promise<{ sessions: ChatSession[] }> {
  return apiClient<{ sessions: ChatSession[] }>({ path: `/api/organizations/${organizationId}/ai/sessions` });
}

export async function fetchChatSession({ organizationId, sessionId }: { organizationId: string; sessionId: string }): Promise<ChatSessionWithMessages> {
  return apiClient<ChatSessionWithMessages>({ path: `/api/organizations/${organizationId}/ai/sessions/${sessionId}` });
}

export async function deleteChatSession({ organizationId, sessionId }: { organizationId: string; sessionId: string }): Promise<void> {
  await apiClient({ path: `/api/organizations/${organizationId}/ai/sessions/${sessionId}`, method: 'DELETE' });
}

export async function streamChatMessage({ organizationId, messages, model, sessionId, onChunk, onSessionId, signal }: {
  organizationId: string;
  messages: ChatMessage[];
  model?: string;
  sessionId?: string;
  onChunk: (text: string) => void;
  onSessionId?: (id: string) => void;
  signal?: AbortSignal;
}) {
  const response = await fetch(`${buildTimeConfig.baseApiUrl}/api/organizations/${organizationId}/ai/chat`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    credentials: 'include',
    body: JSON.stringify({ messages, model, sessionId }),
    signal,
  });

  if (!response.ok) {
    const error = await response.json().catch(() => ({ message: 'Chat request failed' }));
    throw new Error(error.message ?? `Request failed with status ${response.status}`);
  }

  // Extract session ID from response header
  const returnedSessionId = response.headers.get('X-Session-Id');
  if (returnedSessionId && onSessionId) {
    onSessionId(returnedSessionId);
  }

  const reader = response.body?.getReader();
  if (!reader) {
    throw new Error('No response stream');
  }

  const decoder = new TextDecoder();

  while (true) {
    const { done, value } = await reader.read();
    if (done) {
      break;
    }
    const text = decoder.decode(value, { stream: true });
    onChunk(text);
  }
}
