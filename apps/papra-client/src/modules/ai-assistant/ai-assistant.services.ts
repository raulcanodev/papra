import { buildTimeConfig } from '../config/config';
import { apiClient } from '../shared/http/api-client';

export type ToolConfirmation = {
  toolCallId: string;
  toolName: string;
  description: string;
  args: Record<string, unknown>;
  status: 'pending' | 'approved' | 'rejected';
  result?: unknown;
};

export type WebSource = {
  title: string;
  url: string;
};

export type ChatMessage = {
  id?: string;
  role: 'user' | 'assistant' | 'system';
  content: string;
  thinking?: string;
  toolConfirmations?: ToolConfirmation[];
  activeToolCalls?: string[];
  webSources?: WebSource[];
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
  provider: 'openai' | 'anthropic' | 'xai' | 'google';
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
  type RawMessage = {
    id: string;
    role: string;
    content: string;
    metadata?: {
      webSources?: WebSource[];
      toolConfirmations?: ToolConfirmation[];
    };
  };
  const raw = await apiClient<{ session: ChatSession; messages: RawMessage[] }>({
    path: `/api/organizations/${organizationId}/ai/sessions/${sessionId}`,
  });

  return {
    session: raw.session,
    messages: raw.messages.map(m => ({
      id: m.id,
      role: m.role as ChatMessage['role'],
      content: m.content,
      webSources: m.metadata?.webSources,
      toolConfirmations: m.metadata?.toolConfirmations,
    })),
  };
}

export async function updateMessageMetadata({ organizationId, sessionId, messageId, metadata }: {
  organizationId: string;
  sessionId: string;
  messageId: string;
  metadata: string;
}): Promise<void> {
  await apiClient({ path: `/api/organizations/${organizationId}/ai/sessions/${sessionId}/messages/${messageId}/metadata`, method: 'PATCH', body: { metadata } });
}

export async function deleteChatSession({ organizationId, sessionId }: { organizationId: string; sessionId: string }): Promise<void> {
  await apiClient({ path: `/api/organizations/${organizationId}/ai/sessions/${sessionId}`, method: 'DELETE' });
}

export async function renameChatSession({ organizationId, sessionId, title }: { organizationId: string; sessionId: string; title: string }): Promise<void> {
  await apiClient({ path: `/api/organizations/${organizationId}/ai/sessions/${sessionId}`, method: 'PATCH', body: { title } });
}

function serializeMessages(messages: ChatMessage[]): Array<{ role: string; content: string }> {
  return messages.map((m) => {
    let content = m.content;

    // Append tool confirmation results so the AI knows what was approved/rejected
    if (m.role === 'assistant' && m.toolConfirmations?.length) {
      const results = m.toolConfirmations
        .filter(tc => tc.status !== 'pending')
        .map((tc) => {
          if (tc.status === 'approved') {
            const resultStr = tc.result ? ` Result: ${JSON.stringify(tc.result)}` : '';
            return `[APPROVED: ${tc.toolName}${resultStr}]`;
          }
          return `[SKIPPED: ${tc.toolName}]`;
        });

      if (results.length > 0) {
        content = `${content}\n\n${results.join('\n')}`;
      }
    }

    return { role: m.role, content };
  });
}

export async function streamChatMessage({ organizationId, messages, model, sessionId, onChunk, onThinking, onToolConfirmation, onToolActivity, onToolDone, onWebSources, onSessionId, signal }: {
  organizationId: string;
  messages: ChatMessage[];
  model?: string;
  sessionId?: string;
  onChunk: (text: string) => void;
  onThinking?: (text: string) => void;
  onToolConfirmation?: (confirmation: ToolConfirmation) => void;
  onToolActivity?: (toolName: string) => void;
  onToolDone?: (toolName: string) => void;
  onWebSources?: (sources: WebSource[]) => void;
  onSessionId?: (id: string) => void;
  signal?: AbortSignal;
}) {
  const response = await fetch(`${buildTimeConfig.baseApiUrl}/api/organizations/${organizationId}/ai/chat`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    credentials: 'include',
    body: JSON.stringify({ messages: serializeMessages(messages), model, sessionId }),
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
  let buffer = '';

  while (true) {
    const { done, value } = await reader.read();
    if (done) {
      break;
    }
    buffer += decoder.decode(value, { stream: true });

    // Parse data stream protocol: each line is TYPE_CODE:JSON_DATA\n
    const lines = buffer.split('\n');
    buffer = lines.pop() ?? '';

    for (const line of lines) {
      if (!line) {
        continue;
      }
      const colonIdx = line.indexOf(':');
      if (colonIdx === -1) {
        continue;
      }
      const typeCode = line.slice(0, colonIdx);
      const jsonStr = line.slice(colonIdx + 1);
      try {
        const data = JSON.parse(jsonStr);
        switch (typeCode) {
          case '0': // Text delta
            onChunk(data as string);
            break;
          case 'r': // Reasoning/thinking delta
            if (onThinking) {
              onThinking(data as string);
            }
            break;
          case 't': { // Tool call started
            const activity = data as { toolName: string };
            if (activity.toolName && onToolActivity) {
              onToolActivity(activity.toolName);
            }
            break;
          }
          case 'd': { // Tool call finished
            const done = data as { toolName: string };
            if (done.toolName && onToolDone) {
              onToolDone(done.toolName);
            }
            break;
          }
          case 's': { // Web search sources
            const sources = data as WebSource[];
            if (Array.isArray(sources) && onWebSources) {
              onWebSources(sources);
            }
            break;
          }
          case 'a': { // Tool confirmation
            const conf = data as { toolCallId: string; toolName: string; description: string; args: Record<string, unknown> };
            if (conf.toolName && onToolConfirmation) {
              onToolConfirmation({
                toolCallId: conf.toolCallId,
                toolName: conf.toolName,
                description: conf.description,
                args: conf.args,
                status: 'pending',
              });
            }
            break;
          }
        }
      } catch {
        // Skip unparseable lines
      }
    }
  }
}

export async function executeToolAction({ organizationId, toolName, args }: {
  organizationId: string;
  toolName: string;
  args: Record<string, unknown>;
}) {
  return apiClient<Record<string, unknown>>({
    method: 'POST',
    path: `/api/organizations/${organizationId}/ai/tools/execute`,
    body: { toolName, args },
  });
}

export async function fetchUserAiProfile(): Promise<{ profile: Record<string, string> }> {
  return apiClient<{ profile: Record<string, string> }>({ path: '/api/ai/profile' });
}

export async function updateUserAiProfile({ entries }: { entries: Record<string, string> }): Promise<{ profile: Record<string, string> }> {
  return apiClient<{ profile: Record<string, string> }>({
    method: 'PATCH',
    path: '/api/ai/profile',
    body: { entries },
  });
}

export async function deleteUserAiProfileKey({ key }: { key: string }): Promise<{ profile: Record<string, string> }> {
  return apiClient<{ profile: Record<string, string> }>({
    method: 'DELETE',
    path: `/api/ai/profile/${encodeURIComponent(key)}`,
  });
}
