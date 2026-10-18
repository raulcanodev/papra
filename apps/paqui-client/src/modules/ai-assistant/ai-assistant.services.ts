import type { PageContext } from './page-context/build-page-context';
import { buildTimeConfig, isDemoMode } from '../config/config';
import { apiClient } from '../shared/http/api-client';
import { getFormData } from '../shared/http/http-client.models';

export type ToolConfirmation = {
  toolCallId: string;
  toolName: string;
  description: string;
  args: Record<string, unknown>;
  status: 'pending' | 'approved' | 'rejected';
  result?: unknown;
};

export type NavigationRequest = {
  path: string;
  label: string | null;
  reason: string | null;
};

export type WebSource = {
  title: string;
  url: string;
};

/** A file attached to a message: a document of the organization */
export type ChatAttachment = {
  documentId: string;
  name: string;
  mimeType: string;
  size: number;
};

export type ChatMessage = {
  id?: string;
  role: 'user' | 'assistant' | 'system';
  content: string;
  attachments?: ChatAttachment[];
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
      attachments?: ChatAttachment[];
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
      attachments: m.metadata?.attachments,
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

// The file is stored as a document of the organization; one already there (same content) is given back, not duplicated
export async function uploadChatAttachment({ organizationId, file }: { organizationId: string; file: File }): Promise<{ attachment: ChatAttachment }> {
  const { document } = await apiClient<{ document: { id: string; name: string; mimeType: string; originalSize: number } }>({
    method: 'POST',
    path: `/api/organizations/${organizationId}/ai/attachments`,
    body: getFormData({ file }),
  });

  return { attachment: { documentId: document.id, name: document.name, mimeType: document.mimeType, size: document.originalSize } };
}

function serializeMessages(messages: ChatMessage[]): Array<{ role: string; content: string; attachments?: { documentId: string }[] }> {
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

    return { role: m.role, content, ...(m.attachments?.length ? { attachments: m.attachments.map(({ documentId }) => ({ documentId })) } : {}) };
  });
}

export async function streamChatMessage({ organizationId, messages, sessionId, onChunk, onThinking, onToolConfirmation, onToolActivity, onToolDone, onWebSources, onNavigate, onSessionId, pageContext, signal }: {
  organizationId: string;
  messages: ChatMessage[];
  sessionId?: string;
  /** Where the user is and what is on screen, so the assistant answers about it */
  pageContext?: PageContext;
  onChunk: (text: string) => void;
  onThinking?: (text: string) => void;
  onToolConfirmation?: (confirmation: ToolConfirmation) => void;
  onToolActivity?: (toolName: string) => void;
  onToolDone?: (toolName: string) => void;
  onWebSources?: (sources: WebSource[]) => void;
  onNavigate?: (navigation: NavigationRequest) => void;
  onSessionId?: (id: string) => void;
  signal?: AbortSignal;
}) {
  if (isDemoMode) {
    // The public demo never reaches a server: a scripted assistant answers from the browser's local data.
    const { demoStreamChatMessage } = await import('../demo/ai/demo-ai');
    return demoStreamChatMessage({ organizationId, messages, sessionId, onChunk, onSessionId, signal });
  }

  const response = await fetch(`${buildTimeConfig.baseApiUrl}/api/organizations/${organizationId}/ai/chat`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    credentials: 'include',
    body: JSON.stringify({ messages: serializeMessages(messages), sessionId, pageContext }),
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
          case 'n': // The assistant takes the user to another page
            if (onNavigate) {
              onNavigate(data as NavigationRequest);
            }
            break;
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
