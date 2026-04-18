import type { Component, JSX } from 'solid-js';
import type { ChatMessage, ChatSession, ToolConfirmation } from '../ai-assistant.services';
import { useParams } from '@solidjs/router';
import remarkGfm from 'remark-gfm';
import { createResource, createSignal, For, onCleanup, onMount, Show } from 'solid-js';
import { SolidMarkdown } from 'solid-markdown';
import { useI18n } from '@/modules/i18n/i18n.provider';
import { cn } from '@/modules/shared/style/cn';
import { Button } from '@/modules/ui/components/button';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/modules/ui/components/dropdown-menu';
import { deleteChatSession, executeToolAction, fetchAiModels, fetchChatSession, fetchChatSessions, renameChatSession, streamChatMessage } from '../ai-assistant.services';

const PLACEHOLDER_SUGGESTION_CONFIG = [
  { icon: 'i-tabler-files', key: 'ai-assistant.suggestion.documents-overview' as const },
  { icon: 'i-tabler-file-search', key: 'ai-assistant.suggestion.find-invoices' as const },
  { icon: 'i-tabler-chart-bar', key: 'ai-assistant.suggestion.financial-summary' as const },
  { icon: 'i-tabler-transfer', key: 'ai-assistant.suggestion.transfer-rules' as const },
  { icon: 'i-tabler-tag', key: 'ai-assistant.suggestion.classify-rules' as const },
  { icon: 'i-tabler-help', key: 'ai-assistant.suggestion.unclassified' as const },
];

const TOOL_LABELS: Record<string, string> = {
  createClassificationRule: 'Create Classification Rule',
  updateClassificationRule: 'Update Classification Rule',
  deleteClassificationRule: 'Delete Classification Rule',
  createTaggingRule: 'Create Document Rule',
  updateTaggingRule: 'Update Document Rule',
  deleteTaggingRule: 'Delete Document Rule',
};

const CLASSIFICATION_LABELS: Record<string, string> = {
  expense: 'Expense',
  income: 'Income',
  owner_transfer: 'Owner Transfer',
  internal_transfer: 'Internal Transfer',
};

const CLASSIFICATION_COLORS: Record<string, string> = {
  expense: 'text-red-600 bg-red-500/10',
  income: 'text-green-600 bg-green-500/10',
  owner_transfer: 'text-blue-600 bg-blue-500/10',
  internal_transfer: 'text-purple-600 bg-purple-500/10',
};

type RuleCardData = {
  name: string;
  classification?: string;
  matchMode?: string;
  conditions?: Array<{ field: string; operator: string; value: string }>;
  tags?: string[];
};

const RulePreviewCard: Component<{ rule: RuleCardData }> = (props) => {
  return (
    <div class="not-prose my-2 rounded-lg border border-border/60 bg-card/50 overflow-hidden">
      <div class="flex items-center gap-2 px-3 py-2 bg-muted/30 border-b border-border/40">
        <div class="i-tabler-rule size-4 text-primary/70" />
        <span class="text-sm font-medium text-foreground">{props.rule.name}</span>
      </div>
      <div class="px-3 py-2 space-y-1.5">
        <Show when={props.rule.classification}>
          <div class="flex items-center gap-2">
            <span class="text-xs text-muted-foreground">Classification:</span>
            <span class={cn('text-xs font-medium px-1.5 py-0.5 rounded', CLASSIFICATION_COLORS[props.rule.classification!] ?? 'text-foreground bg-muted')}>
              {CLASSIFICATION_LABELS[props.rule.classification!] ?? props.rule.classification}
            </span>
          </div>
        </Show>
        <Show when={props.rule.conditions && props.rule.conditions.length > 0}>
          <div class="flex items-start gap-2">
            <span class="text-xs text-muted-foreground mt-0.5 shrink-0">
              {props.rule.matchMode === 'any' ? 'Any of:' : 'All of:'}
            </span>
            <div class="flex flex-col gap-1">
              <For each={props.rule.conditions}>
                {cond => (
                  <div class="text-xs flex items-center gap-1">
                    <span class="font-medium text-foreground">{cond.field}</span>
                    <span class="text-muted-foreground">{cond.operator}</span>
                    <span class="font-mono text-primary bg-primary/5 px-1 rounded">"{cond.value}"</span>
                  </div>
                )}
              </For>
            </div>
          </div>
        </Show>
        <Show when={props.rule.tags && props.rule.tags.length > 0}>
          <div class="flex items-center gap-2">
            <span class="text-xs text-muted-foreground">Tags:</span>
            <div class="flex gap-1 flex-wrap">
              <For each={props.rule.tags}>
                {tag => <span class="text-xs bg-muted px-1.5 py-0.5 rounded">{tag}</span>}
              </For>
            </div>
          </div>
        </Show>
      </div>
    </div>
  );
};

type DataCardData = {
  title?: string;
  columns?: string[];
  rows?: Array<Array<string | number>>;
  items?: Array<{ label: string; value: string | number }>;
};

const DataDisplayCard: Component<{ data: DataCardData }> = (props) => {
  return (
    <div class="not-prose my-2 rounded-lg border border-border/60 bg-card/50 overflow-hidden">
      <Show when={props.data.title}>
        <div class="flex items-center gap-2 px-3 py-2 bg-muted/30 border-b border-border/40">
          <div class="i-tabler-table size-4 text-primary/70" />
          <span class="text-sm font-medium text-foreground">{props.data.title}</span>
        </div>
      </Show>
      <Show when={props.data.items}>
        <div class="px-3 py-2 space-y-1">
          <For each={props.data.items}>
            {item => (
              <div class="flex items-center justify-between text-xs py-0.5">
                <span class="text-muted-foreground">{item.label}</span>
                <span class="font-medium text-foreground">{item.value}</span>
              </div>
            )}
          </For>
        </div>
      </Show>
      <Show when={props.data.columns && props.data.rows}>
        <div class="overflow-x-auto">
          <table class="w-full text-xs">
            <thead>
              <tr class="border-b border-border/40">
                <For each={props.data.columns}>
                  {col => <th class="text-left px-3 py-1.5 text-muted-foreground font-medium">{col}</th>}
                </For>
              </tr>
            </thead>
            <tbody>
              <For each={props.data.rows}>
                {row => (
                  <tr class="border-b border-border/20 last:border-b-0">
                    <For each={row}>
                      {(cell, i) => (
                        <td class={cn('px-3 py-1.5', i() === 0 ? 'font-medium text-foreground' : 'text-muted-foreground')}>
                          {cell}
                        </td>
                      )}
                    </For>
                  </tr>
                )}
              </For>
            </tbody>
          </table>
        </div>
      </Show>
    </div>
  );
};

function getTextContent(children: unknown): string {
  if (typeof children === 'string') return children;
  if (Array.isArray(children)) return children.map(getTextContent).join('');
  return String(children ?? '');
}

// Clean up AI content: strip tool result markers and papra-* fences, re-wrap JSON properly
function preprocessMessageContent(content: string): string {
  // 0. Strip [APPROVED: ...] and [SKIPPED: ...] markers (tool result context not meant for display)
  let cleaned = content.replace(/\[(?:APPROVED|SKIPPED):\s*\w+(?:\s+Result:\s*\{[^]*?\})?\]/g, '');

  // 1. Remove any papra-rule/papra-data fence markers (open and close), leaving just the JSON
  cleaned = cleaned.replace(/```papra-(rule|data)\s*/g, '');
  cleaned = cleaned.replace(/```\s*(?=\n|$)/g, (match, offset: number) => {
    // Only strip closing ``` that look like they close a papra fence (preceded by JSON-like content)
    const before = cleaned.slice(Math.max(0, offset - 200), offset);
    if (/\}\s*$/.test(before)) return '';
    return match;
  });

  // 2. Find standalone JSON objects on their own line and wrap them
  cleaned = cleaned.replace(/(?:^|\n)\s*(\{[^\n]*\})\s*(?:\n|$)/g, (match, json: string) => {
    try {
      const parsed = JSON.parse(json) as Record<string, unknown>;
      if (parsed.title || parsed.columns || parsed.items) {
        return `\n\`\`\`papra-data\n${json}\n\`\`\`\n`;
      }
      if (parsed.name && (parsed.classification || parsed.conditions)) {
        return `\n\`\`\`papra-rule\n${json}\n\`\`\`\n`;
      }
    } catch { /* not valid JSON, leave as-is */ }
    return match;
  });

  // 3. Collapse excessive whitespace left by stripped markers
  cleaned = cleaned.replace(/\n{3,}/g, '\n\n').trim();

  return cleaned;
}

const markdownComponents = {
  pre: (props: { children?: JSX.Element }) => {
    return <>{props.children}</>;
  },
  code: (props: { inline?: boolean; className?: string; children?: JSX.Element }) => {
    if (props.inline) {
      return <code class={props.className}>{props.children}</code>;
    }

    const lang = props.className?.replace('language-', '') ?? '';
    const raw = getTextContent(props.children).trim();

    if (lang === 'papra-rule') {
      try {
        const data = JSON.parse(raw) as RuleCardData;
        return <RulePreviewCard rule={data} />;
      } catch { /* fall through */ }
    }

    if (lang === 'papra-data') {
      try {
        const data = JSON.parse(raw) as DataCardData;
        return <DataDisplayCard data={data} />;
      } catch { /* fall through */ }
    }

    // Default code block
    return <pre class="my-2 bg-muted text-foreground rounded-md overflow-x-auto"><code class={props.className}>{props.children}</code></pre>;
  },
};

const ToolConfirmationCard: Component<{
  confirmation: ToolConfirmation;
  organizationId: string;
  onStatusChange: (toolCallId: string, status: 'approved' | 'rejected', result?: unknown) => void;
}> = (props) => {
  const [isLoading, setIsLoading] = createSignal(false);

  const handleApprove = async () => {
    setIsLoading(true);
    try {
      const result = await executeToolAction({
        organizationId: props.organizationId,
        toolName: props.confirmation.toolName,
        args: props.confirmation.args,
      });
      props.onStatusChange(props.confirmation.toolCallId, 'approved', result);
    } catch (err) {
      props.onStatusChange(props.confirmation.toolCallId, 'approved', { error: err instanceof Error ? err.message : 'Failed' });
    } finally {
      setIsLoading(false);
    }
  };

  const statusBorder = () => {
    if (props.confirmation.status === 'approved') return 'border-green-500/40';
    if (props.confirmation.status === 'rejected') return 'border-muted-foreground/20 opacity-60';
    return 'border-primary/40';
  };

  const isRuleTool = () => ['createClassificationRule', 'updateClassificationRule', 'createTaggingRule', 'updateTaggingRule'].includes(props.confirmation.toolName);
  const isDelete = () => ['deleteClassificationRule', 'deleteTaggingRule'].includes(props.confirmation.toolName);

  const args = () => props.confirmation.args as Record<string, unknown>;

  return (
    <div class={cn('not-prose rounded-lg border-2 mt-3 overflow-hidden transition-colors', statusBorder())}>
      {/* Header */}
      <div class={cn(
        'flex items-center gap-2 px-3 py-2',
        props.confirmation.status === 'approved' ? 'bg-green-500/5' : props.confirmation.status === 'rejected' ? 'bg-muted/30' : 'bg-primary/5',
      )}>
        <div class={cn(
          'size-4 shrink-0',
          props.confirmation.status === 'approved' ? 'i-tabler-check text-green-600' : props.confirmation.status === 'rejected' ? 'i-tabler-x text-muted-foreground' : isDelete() ? 'i-tabler-trash text-destructive' : 'i-tabler-rule text-primary',
        )} />
        <span class="text-sm font-medium flex-1">
          {TOOL_LABELS[props.confirmation.toolName] ?? props.confirmation.toolName}
        </span>
        <Show when={props.confirmation.status === 'approved'}>
          <span class="text-xs font-medium text-green-600">Approved</span>
        </Show>
        <Show when={props.confirmation.status === 'rejected'}>
          <span class="text-xs text-muted-foreground">Skipped</span>
        </Show>
      </div>

      {/* Rule preview body */}
      <Show when={isRuleTool()}>
        <div class="px-3 py-2 space-y-1.5 border-t border-border/30">
          <Show when={args().name}>
            <div class="flex items-center gap-2">
              <span class="text-xs text-muted-foreground shrink-0">Name:</span>
              <span class="text-xs font-medium text-foreground">{args().name as string}</span>
            </div>
          </Show>
          <Show when={args().classification}>
            <div class="flex items-center gap-2">
              <span class="text-xs text-muted-foreground shrink-0">Classification:</span>
              <span class={cn('text-xs font-medium px-1.5 py-0.5 rounded', CLASSIFICATION_COLORS[args().classification as string] ?? 'text-foreground bg-muted')}>
                {CLASSIFICATION_LABELS[args().classification as string] ?? (args().classification as string)}
              </span>
            </div>
          </Show>
          <Show when={Array.isArray(args().conditions) && (args().conditions as unknown[]).length > 0}>
            <div class="flex items-start gap-2">
              <span class="text-xs text-muted-foreground mt-0.5 shrink-0">
                {(args().conditionMatchMode as string) === 'any' ? 'Any of:' : 'All of:'}
              </span>
              <div class="flex flex-col gap-1">
                <For each={args().conditions as Array<{ field: string; operator: string; value: string }>}>
                  {cond => (
                    <div class="text-xs flex items-center gap-1 flex-wrap">
                      <span class="font-medium text-foreground">{cond.field}</span>
                      <span class="text-muted-foreground">{cond.operator}</span>
                      <span class="font-mono text-primary bg-primary/5 px-1 rounded">"{cond.value}"</span>
                    </div>
                  )}
                </For>
              </div>
            </div>
          </Show>
        </div>
      </Show>

      {/* Delete body */}
      <Show when={isDelete()}>
        <div class="px-3 py-2 border-t border-border/30">
          <p class="text-xs text-destructive/80">{props.confirmation.description}</p>
        </div>
      </Show>

      {/* Generic fallback for unknown tools */}
      <Show when={!isRuleTool() && !isDelete()}>
        <div class="px-3 py-2 border-t border-border/30">
          <p class="text-xs text-muted-foreground">{props.confirmation.description}</p>
        </div>
      </Show>

      {/* Actions */}
      <Show when={props.confirmation.status === 'pending'}>
        <div class="flex gap-2 px-3 py-2 border-t border-border/30 bg-muted/20">
          <Button size="sm" class="h-7 text-xs gap-1" onClick={() => void handleApprove()} disabled={isLoading()} isLoading={isLoading()}>
            <div class="i-tabler-check size-3.5" />
            Approve
          </Button>
          <Button variant="outline" size="sm" class="h-7 text-xs gap-1" onClick={() => props.onStatusChange(props.confirmation.toolCallId, 'rejected')} disabled={isLoading()}>
            <div class="i-tabler-x size-3.5" />
            Skip
          </Button>
        </div>
      </Show>

      {/* Result after approval */}
      <Show when={props.confirmation.status === 'approved' && props.confirmation.result}>
        <div class="px-3 py-1.5 border-t border-green-500/20 bg-green-500/5">
          <p class="text-xs text-green-600">
            {(props.confirmation.result as Record<string, string>)?.message ?? 'Done'}
          </p>
        </div>
      </Show>
    </div>
  );
};

const MessageBubble: Component<{ message: ChatMessage; isStreaming?: boolean; organizationId: string; onToolStatusChange?: (toolCallId: string, status: 'approved' | 'rejected', result?: unknown) => void }> = (props) => {
  const isUser = () => props.message.role === 'user';
  const [thinkingOpen, setThinkingOpen] = createSignal(false);
  const hasThinking = () => !!props.message.thinking;
  const isThinkingLive = () => props.isStreaming && hasThinking() && !props.message.content;

  return (
    <div class={cn('flex gap-3 py-4', isUser() ? 'flex-row-reverse' : 'flex-row')}>

      <div class={cn('flex flex-col gap-1 min-w-0 flex-1', isUser() ? 'items-end' : 'items-start')}>
        <Show when={isUser()}>
          <div class="rounded-2xl bg-muted text-foreground rounded-tr-sm px-4 py-2.5 text-sm leading-relaxed whitespace-pre-wrap break-words max-w-full">
            {props.message.content}
          </div>
        </Show>
        <Show when={!isUser()}>
          <div class="text-sm leading-relaxed break-words max-w-full prose prose-sm prose-neutral dark:prose-invert prose-p:my-1 prose-ul:my-1 prose-ol:my-1 prose-li:my-0.5 prose-headings:my-2 prose-pre:my-2 prose-pre:bg-muted prose-pre:text-foreground prose-code:text-foreground prose-code:before:content-none prose-code:after:content-none">
            <Show when={hasThinking()}>
              <Show when={isThinkingLive()}>
                <div class="flex items-center gap-2 py-1.5 px-2 mb-2 rounded-md bg-muted/50 border border-border/50 text-muted-foreground text-xs">
                  <div class="i-tabler-brain size-3.5 animate-pulse" />
                  <span class="font-medium">Thinking...</span>
                </div>
              </Show>
              <Show when={!isThinkingLive()}>
                <button
                  type="button"
                  class="flex items-center gap-1.5 py-1 px-2 mb-2 rounded-md hover:bg-muted/50 transition-colors text-muted-foreground text-xs cursor-pointer select-none"
                  onClick={() => setThinkingOpen(v => !v)}
                >
                  <div class={cn('i-tabler-chevron-right size-3.5 transition-transform', thinkingOpen() && 'rotate-90')} />
                  <div class="i-tabler-brain size-3.5" />
                  <span>Thinking</span>
                </button>
                <Show when={thinkingOpen()}>
                  <div class="mb-2 py-2 px-3 rounded-md bg-muted/30 border border-border/40 text-xs text-muted-foreground leading-relaxed whitespace-pre-wrap max-h-60 overflow-y-auto">
                    {props.message.thinking}
                  </div>
                </Show>
              </Show>
            </Show>
            <Show when={!props.message.content && props.isStreaming && !isThinkingLive()}>
              <div class="flex items-center gap-1.5 py-1 text-muted-foreground">
                <div class="size-1.5 rounded-full bg-current animate-pulse" />
                <div class="size-1.5 rounded-full bg-current animate-pulse" style={{ 'animation-delay': '0.15s' }} />
                <div class="size-1.5 rounded-full bg-current animate-pulse" style={{ 'animation-delay': '0.3s' }} />
              </div>
            </Show>
            <Show when={props.message.content}>
              <SolidMarkdown remarkPlugins={[remarkGfm]} components={markdownComponents} children={preprocessMessageContent(props.message.content)} />
              <Show when={props.isStreaming}>
                <span class="inline-block w-0.5 h-4 bg-foreground ml-0.5 align-middle animate-pulse" />
              </Show>
            </Show>
            <Show when={(props.message.toolConfirmations ?? []).length > 0}>
              <For each={props.message.toolConfirmations}>
                {confirmation => (
                  <ToolConfirmationCard
                    confirmation={confirmation}
                    organizationId={props.organizationId}
                    onStatusChange={(id, status, result) => props.onToolStatusChange?.(id, status, result)}
                  />
                )}
              </For>
            </Show>
          </div>
        </Show>
      </div>
    </div>
  );
};

const ChatHistoryItem: Component<{
  session: ChatSession;
  isActive: boolean;
  onSelect: () => void;
  onDelete: () => void;
  onRename: (newTitle: string) => void;
}> = (props) => {
  const [editing, setEditing] = createSignal(false);
  let inputRef: HTMLInputElement | undefined;

  const startEdit = (e: Event) => {
    e.stopPropagation();
    setEditing(true);
    setTimeout(() => inputRef?.select(), 0);
  };

  const commitEdit = () => {
    const val = inputRef?.value.trim();
    if (val && val !== props.session.title) {
      props.onRename(val);
    }
    setEditing(false);
  };

  return (
    <Show
      when={!editing()}
      fallback={
        <div class="w-full px-3 py-1.5 rounded-lg bg-muted flex items-center gap-2">
          <input
            ref={inputRef}
            class="flex-1 text-sm bg-transparent outline-none min-w-0"
            value={props.session.title}
            onBlur={commitEdit}
            onKeyDown={(e) => {
              if (e.key === 'Enter') commitEdit();
              if (e.key === 'Escape') setEditing(false);
            }}
          />
        </div>
      }
    >
      <button
        type="button"
        class={cn(
          'w-full text-left px-3 py-2 rounded-lg text-sm truncate transition-colors group flex items-center gap-2',
          props.isActive
            ? 'bg-muted font-medium'
            : 'hover:bg-muted/50 text-muted-foreground',
        )}
        onClick={() => props.onSelect()}
      >
        <div class="i-tabler-message size-3.5 shrink-0 opacity-50" />
        <span class="truncate flex-1">{props.session.title}</span>
        <div
          role="button"
          tabIndex={0}
          class="i-tabler-pencil size-3.5 shrink-0 opacity-0 group-hover:opacity-40 hover:!opacity-100 transition-opacity"
          onClick={startEdit}
          onKeyDown={(e) => {
            if (e.key === 'Enter' || e.key === ' ') startEdit(e);
          }}
        />
        <div
          role="button"
          tabIndex={0}
          class="i-tabler-x size-3.5 shrink-0 opacity-0 group-hover:opacity-40 hover:!opacity-100 transition-opacity"
          onClick={(e) => {
            e.stopPropagation();
            props.onDelete();
          }}
          onKeyDown={(e) => {
            if (e.key === 'Enter' || e.key === ' ') {
              e.stopPropagation();
              props.onDelete();
            }
          }}
        />
      </button>
    </Show>
  );
};

export const AiAssistantPage: Component = () => {
  const { t } = useI18n();
  const params = useParams();
  const [messages, setMessages] = createSignal<ChatMessage[]>([]);
  const [input, setInput] = createSignal('');
  const [isStreaming, setIsStreaming] = createSignal(false);
  const [selectedModel, setSelectedModel] = createSignal<string>(localStorage.getItem('papra-ai-model') ?? '');
  const [activeChatId, setActiveChatId] = createSignal<string | undefined>(sessionStorage.getItem('papra-ai-chat') ?? undefined);
  const [showHistory, setShowHistory] = createSignal(false);
  let abortController: AbortController | undefined;
  let messagesEndRef: HTMLDivElement | undefined;
  let textareaRef: HTMLTextAreaElement | undefined;

  const orgId = () => params.organizationId;

  function handleToolStatusChange(toolCallId: string, status: 'approved' | 'rejected', result?: unknown) {
    setMessages(prev => prev.map(msg => {
      if (!msg.toolConfirmations) return msg;
      const updated = msg.toolConfirmations.map(tc =>
        tc.toolCallId === toolCallId ? { ...tc, status, result } : tc,
      );
      if (updated === msg.toolConfirmations) return msg;
      return { ...msg, toolConfirmations: updated };
    }));
  }
  const [modelsData] = createResource(fetchAiModels);
  const [sessionsData, { refetch: refetchSessions }] = createResource(orgId, organizationId => fetchChatSessions({ organizationId }));

  const models = () => modelsData()?.models ?? [];
  const currentModel = () => selectedModel() || modelsData()?.defaultModel || '';
  const sessions = () => sessionsData()?.sessions ?? [];
  const suggestions = () => PLACEHOLDER_SUGGESTION_CONFIG.map(s => ({ icon: s.icon, text: t(s.key) }));

  function selectModel(id: string) {
    setSelectedModel(id);
    localStorage.setItem('papra-ai-model', id);
  }

  function setActiveChat(id: string | undefined) {
    setActiveChatId(id);
    if (id) {
      sessionStorage.setItem('papra-ai-chat', id);
    } else {
      sessionStorage.removeItem('papra-ai-chat');
    }
  }

  onCleanup(() => {
    abortController?.abort();
  });

  // Restore last active chat on mount
  onMount(async () => {
    const storedChatId = sessionStorage.getItem('papra-ai-chat');
    if (!storedChatId) {
      return;
    }
    try {
      const data = await fetchChatSession({ organizationId: orgId(), sessionId: storedChatId });
      setActiveChatId(storedChatId);
      setMessages(data.messages);
      selectModel(data.session?.model ?? selectedModel());
      scrollToBottom();
    } catch {
      sessionStorage.removeItem('papra-ai-chat');
    }
  });

  function scrollToBottom() {
    requestAnimationFrame(() => {
      messagesEndRef?.scrollIntoView({ behavior: 'smooth' });
    });
  }

  function autoResizeTextarea() {
    if (!textareaRef) {
      return;
    }
    textareaRef.style.height = 'auto';
    textareaRef.style.height = `${Math.min(textareaRef.scrollHeight, 160)}px`;
  }

  async function sendMessage(text?: string) {
    const content = (text ?? textareaRef?.value ?? '').trim();
    if (!content || isStreaming()) {
      return;
    }

    setInput('');
    if (textareaRef) {
      textareaRef.value = '';
      textareaRef.style.height = 'auto';
    }

    const userMessage: ChatMessage = { role: 'user', content };
    const updatedMessages = [...messages(), userMessage];
    setMessages(updatedMessages);

    const assistantMessage: ChatMessage = { role: 'assistant', content: '' };
    setMessages([...updatedMessages, assistantMessage]);
    scrollToBottom();

    setIsStreaming(true);
    abortController = new AbortController();

    try {
      await streamChatMessage({
        organizationId: orgId(),
        messages: updatedMessages,
        model: selectedModel(),
        sessionId: activeChatId(),
        signal: abortController.signal,
        onSessionId: (id) => {
          setActiveChat(id);
        },
        onChunk: (chunk) => {
          setMessages((prev) => {
            const last = prev[prev.length - 1];
            if (!last || last.role !== 'assistant') {
              return prev;
            }
            return [
              ...prev.slice(0, -1),
              { ...last, content: last.content + chunk },
            ];
          });
          scrollToBottom();
        },
        onThinking: (chunk) => {
          setMessages((prev) => {
            const last = prev[prev.length - 1];
            if (!last || last.role !== 'assistant') {
              return prev;
            }
            return [
              ...prev.slice(0, -1),
              { ...last, thinking: (last.thinking ?? '') + chunk },
            ];
          });
          scrollToBottom();
        },
        onToolConfirmation: (confirmation) => {
          setMessages((prev) => {
            const last = prev[prev.length - 1];
            if (!last || last.role !== 'assistant') {
              return prev;
            }
            return [
              ...prev.slice(0, -1),
              { ...last, toolConfirmations: [...(last.toolConfirmations ?? []), confirmation] },
            ];
          });
          scrollToBottom();
        },
      });
    } catch (error: unknown) {
      if (error instanceof Error && error.name === 'AbortError') {
        return;
      }

      const errorMessage = error instanceof Error ? error.message : 'Something went wrong';
      setMessages((prev) => {
        const last = prev[prev.length - 1];
        if (!last || last.role !== 'assistant') {
          return [...prev, { role: 'assistant', content: `Error: ${errorMessage}` }];
        }
        return [
          ...prev.slice(0, -1),
          { ...last, content: last.content || `Error: ${errorMessage}` },
        ];
      });
    } finally {
      setIsStreaming(false);
      abortController = undefined;
      void refetchSessions();
      requestAnimationFrame(() => textareaRef?.focus());
    }
  }

  function handleKeyDown(e: KeyboardEvent) {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      void sendMessage();
    }
  }

  function handleNewChat() {
    abortController?.abort();
    setMessages([]);
    setInput('');
    if (textareaRef) {
      textareaRef.value = '';
      textareaRef.style.height = 'auto';
    }
    setIsStreaming(false);
    setActiveChat(undefined);
  }

  async function loadChat(session: ChatSession) {
    abortController?.abort();
    setIsStreaming(false);

    const data = await fetchChatSession({ organizationId: orgId(), sessionId: session.id });
    setActiveChat(session.id);
    setMessages(data.messages);
    selectModel(session.model ?? selectedModel());
    scrollToBottom();
  }

  async function handleDeleteChat(sessionId: string) {
    await deleteChatSession({ organizationId: orgId(), sessionId });
    void refetchSessions();
    if (activeChatId() === sessionId) {
      handleNewChat();
    }
  }

  async function handleRenameChat(sessionId: string, title: string) {
    await renameChatSession({ organizationId: orgId(), sessionId, title });
    void refetchSessions();
  }

  return (
    <div class="flex h-[calc(100vh-4rem)]">
      {/* History sidebar */}
      <Show when={showHistory()}>
        <div class="w-64 border-r bg-background shrink-0 flex flex-col min-h-0 h-full">
          <div class="p-3 border-b flex items-center justify-between">
            <span class="text-xs font-semibold text-muted-foreground uppercase tracking-wide">{t('ai-assistant.history.title')}</span>
            <button
              type="button"
              class="i-tabler-x size-4 text-muted-foreground hover:text-foreground transition-colors"
              onClick={() => setShowHistory(false)}
            />
          </div>
          <div class="flex-1 overflow-y-auto p-2 flex flex-col gap-0.5">
            <Show
              when={sessions().length > 0}
              fallback={(
                <p class="text-xs text-muted-foreground text-center py-8">{t('ai-assistant.history.empty')}</p>
              )}
            >
              <For each={sessions()}>
                {session => (
                  <ChatHistoryItem
                    session={session}
                    isActive={activeChatId() === session.id}
                    onSelect={() => void loadChat(session)}
                    onDelete={() => void handleDeleteChat(session.id)}
                    onRename={title => void handleRenameChat(session.id, title)}
                  />
                )}
              </For>
            </Show>
          </div>
        </div>
      </Show>

      {/* Main chat area */}
      <div class="flex flex-col flex-1 min-w-0">
        {/* Header */}
        <div class="border-b px-6 py-3 flex items-center justify-between shrink-0 bg-background">
          <div class="flex items-center gap-3">
            <button
              type="button"
              class="size-8 rounded-lg bg-muted/50 flex items-center justify-center hover:bg-muted transition-colors"
              onClick={() => setShowHistory(!showHistory())}
            >
              <div class="i-tabler-layout-sidebar-left-expand size-4 text-muted-foreground" />
            </button>
            <div>
              <h1 class="text-sm font-semibold leading-none">Papra AI</h1>
              <p class="text-xs text-muted-foreground mt-0.5">{t('ai-assistant.subtitle')}</p>
            </div>
          </div>
          <div class="flex items-center gap-2">
            <Button variant="outline" size="sm" class="h-8 text-xs gap-1.5" onClick={handleNewChat}>
              <div class="i-tabler-plus size-3.5" />
              {t('ai-assistant.new-chat')}
            </Button>
          </div>
        </div>

        {/* Messages area */}
        <div class="flex-1 overflow-y-auto">
          <div class="max-w-3xl mx-auto px-6">
            <Show
              when={messages().length > 0}
              fallback={(
                <div class="flex flex-col items-center justify-center h-full min-h-[calc(100vh-14rem)] gap-8">
                  <div class="text-center">
                    <h2 class="text-2xl font-bold tracking-tight mb-2">Papra AI</h2>
                    <p class="text-muted-foreground text-sm max-w-md">
                      {t('ai-assistant.welcome.description')}
                    </p>
                  </div>
                  <div class="grid grid-cols-1 sm:grid-cols-2 gap-3 max-w-xl w-full">
                    <For each={suggestions()}>
                      {suggestion => (
                        <button
                          type="button"
                          class="group text-left border rounded-xl px-4 py-3 text-sm text-muted-foreground hover:bg-muted/50 hover:border-border transition-all cursor-pointer flex items-start gap-3"
                          onClick={() => void sendMessage(suggestion.text)}
                        >
                          <div class={cn(suggestion.icon, 'size-4 mt-0.5 shrink-0 opacity-50 group-hover:opacity-80 transition-opacity')} />
                          <span>{suggestion.text}</span>
                        </button>
                      )}
                    </For>
                  </div>
                </div>
              )}
            >
              <div>
                <For each={messages()}>
                  {(message, i) => (
                    <MessageBubble
                      message={message}
                      isStreaming={isStreaming() && i() === messages().length - 1 && message.role === 'assistant'}
                      organizationId={orgId()}
                      onToolStatusChange={handleToolStatusChange}
                    />
                  )}
                </For>
              </div>
            </Show>
            <div ref={messagesEndRef} class="h-4" />
          </div>
        </div>

        {/* Input area */}
        <div class="bg-background/80 backdrop-blur-sm px-6 py-4 shrink-0">
          <div class="max-w-3xl mx-auto">
            <div class="relative flex items-end gap-2 rounded-2xl border bg-background shadow-sm focus-within:ring-1 focus-within:ring-ring transition-shadow">
              <textarea
                ref={textareaRef}
                placeholder={t('ai-assistant.input.placeholder')}
                onInput={(e) => {
                  setInput(e.currentTarget.value);
                  autoResizeTextarea();
                }}
                onKeyDown={handleKeyDown}
                disabled={isStreaming()}
                rows={1}
                class="flex-1 resize-none bg-transparent px-4 py-3 text-sm outline-none placeholder:text-muted-foreground disabled:opacity-50 max-h-[160px]"
              />
              <div class="flex items-center gap-1 pb-1.5 pr-2">
                <Show when={isStreaming()}>
                  <Button
                    variant="ghost"
                    size="sm"
                    class="h-8 w-8 p-0 rounded-full"
                    onClick={() => abortController?.abort()}
                  >
                    <div class="i-tabler-player-stop-filled size-4" />
                  </Button>
                </Show>
                <Button
                  size="sm"
                  class="h-8 w-8 p-0 rounded-full"
                  onClick={() => void sendMessage()}
                  disabled={isStreaming() || !input().trim()}
                >
                  <div class="i-tabler-arrow-up size-4" />
                </Button>
              </div>
            </div>
            <div class="flex items-center justify-between mt-2">
              <Show when={models().length > 1}>
                <DropdownMenu>
                  <DropdownMenuTrigger class="inline-flex items-center gap-1 h-6 px-2 rounded text-[11px] text-muted-foreground/60 hover:text-muted-foreground hover:bg-accent/50 transition-colors font-normal cursor-pointer select-none outline-none">
                    <div class={cn(
                      'size-1.5 rounded-full shrink-0',
                      { anthropic: 'bg-orange-500', xai: 'bg-blue-500', google: 'bg-yellow-500', openai: 'bg-green-500' }[models().find(m => m.id === currentModel())?.provider ?? 'openai'],
                    )}
                    />
                    <span>{models().find(m => m.id === currentModel())?.label ?? modelsData()?.defaultModel ?? t('ai-assistant.model.select')}</span>
                    <div class="i-tabler-chevron-down size-3 opacity-50" />
                  </DropdownMenuTrigger>
                  <DropdownMenuContent class="min-w-40">
                    <For each={models()}>
                      {m => (
                        <DropdownMenuItem
                          class="flex items-center gap-2 cursor-pointer text-xs"
                          onClick={() => selectModel(m.id)}
                        >
                          <div class={cn(
                            'size-1.5 rounded-full',
                            { anthropic: 'bg-orange-500', xai: 'bg-blue-500', google: 'bg-yellow-500', openai: 'bg-green-500' }[m.provider],
                          )}
                          />
                          {m.label}
                          <Show when={m.id === currentModel()}>
                            <div class="i-tabler-check size-3 ml-auto text-primary" />
                          </Show>
                        </DropdownMenuItem>
                      )}
                    </For>
                  </DropdownMenuContent>
                </DropdownMenu>
              </Show>
              <Show when={models().length <= 1}>
                <div class="inline-flex items-center gap-1 h-6 px-2 rounded text-[11px] text-muted-foreground/50">
                  <div class={cn(
                    'size-1.5 rounded-full shrink-0',
                    { anthropic: 'bg-orange-500', xai: 'bg-blue-500', google: 'bg-yellow-500', openai: 'bg-green-500' }[models()[0]?.provider ?? modelsData()?.providers?.[0] ?? 'openai'],
                  )}
                  />
                  <span>{models()[0]?.label ?? modelsData()?.models?.[0]?.label ?? currentModel() ?? '—'}</span>
                </div>
              </Show>
              <p class="text-[11px] text-muted-foreground/50 flex-1 text-right">
                {t('ai-assistant.disclaimer')}
              </p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
