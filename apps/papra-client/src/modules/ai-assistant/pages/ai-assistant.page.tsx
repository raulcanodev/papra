import type { Component } from 'solid-js';
import type { ChatMessage, ChatSession } from '../ai-assistant.services';
import { useParams } from '@solidjs/router';
import remarkGfm from 'remark-gfm';
import { createResource, createSignal, For, onCleanup, onMount, Show } from 'solid-js';
import { SolidMarkdown } from 'solid-markdown';
import { useI18n } from '@/modules/i18n/i18n.provider';
import { cn } from '@/modules/shared/style/cn';
import { Button } from '@/modules/ui/components/button';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/modules/ui/components/dropdown-menu';
import { deleteChatSession, fetchAiModels, fetchChatSession, fetchChatSessions, streamChatMessage } from '../ai-assistant.services';

const PLACEHOLDER_SUGGESTION_CONFIG = [
  { icon: 'i-tabler-files', key: 'ai-assistant.suggestion.documents-overview' as const },
  { icon: 'i-tabler-file-search', key: 'ai-assistant.suggestion.find-invoices' as const },
  { icon: 'i-tabler-chart-bar', key: 'ai-assistant.suggestion.financial-summary' as const },
  { icon: 'i-tabler-transfer', key: 'ai-assistant.suggestion.transfer-rules' as const },
  { icon: 'i-tabler-tag', key: 'ai-assistant.suggestion.classify-rules' as const },
  { icon: 'i-tabler-help', key: 'ai-assistant.suggestion.unclassified' as const },
];

const MessageBubble: Component<{ message: ChatMessage; isStreaming?: boolean }> = (props) => {
  const isUser = () => props.message.role === 'user';

  return (
    <div class={cn('flex gap-3 py-4', isUser() ? 'flex-row-reverse' : 'flex-row')}>

      <div class={cn('flex flex-col gap-1 min-w-0 flex-1', isUser() ? 'items-end' : 'items-start')}>
        <Show when={isUser()}>
          <div class="rounded-2xl bg-primary text-primary-foreground rounded-tr-sm px-4 py-2.5 text-sm leading-relaxed whitespace-pre-wrap break-words max-w-full">
            {props.message.content}
          </div>
        </Show>
        <Show when={!isUser()}>
          <div class="text-sm leading-relaxed break-words max-w-full prose prose-sm prose-neutral dark:prose-invert prose-p:my-1 prose-ul:my-1 prose-ol:my-1 prose-li:my-0.5 prose-headings:my-2 prose-pre:my-2 prose-pre:bg-muted prose-pre:text-foreground prose-code:text-foreground prose-code:before:content-none prose-code:after:content-none">
            <Show when={!props.message.content && props.isStreaming}>
              <div class="flex items-center gap-1.5 py-1 text-muted-foreground">
                <div class="size-1.5 rounded-full bg-current animate-pulse" />
                <div class="size-1.5 rounded-full bg-current animate-pulse" style={{ 'animation-delay': '0.15s' }} />
                <div class="size-1.5 rounded-full bg-current animate-pulse" style={{ 'animation-delay': '0.3s' }} />
              </div>
            </Show>
            <Show when={props.message.content}>
              <SolidMarkdown remarkPlugins={[remarkGfm]} children={props.message.content} />
              <Show when={props.isStreaming}>
                <span class="inline-block w-0.5 h-4 bg-foreground ml-0.5 align-middle animate-pulse" />
              </Show>
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
}> = (props) => {
  return (
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
        class="i-tabler-x size-3.5 shrink-0 opacity-0 group-hover:opacity-50 hover:!opacity-100 transition-opacity"
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
  );
};

export const AiAssistantPage: Component = () => {
  const { t } = useI18n();
  const params = useParams();
  const [messages, setMessages] = createSignal<ChatMessage[]>([]);
  const [input, setInput] = createSignal('');
  const [isStreaming, setIsStreaming] = createSignal(false);
  const [selectedModel, setSelectedModel] = createSignal<string>(localStorage.getItem('papra-ai-model') ?? 'gpt-4o');
  const [activeChatId, setActiveChatId] = createSignal<string | undefined>(sessionStorage.getItem('papra-ai-chat') ?? undefined);
  const [showHistory, setShowHistory] = createSignal(false);
  let abortController: AbortController | undefined;
  let messagesEndRef: HTMLDivElement | undefined;
  let textareaRef: HTMLTextAreaElement | undefined;

  const orgId = () => params.organizationId;
  const [modelsData] = createResource(fetchAiModels);
  const [sessionsData, { refetch: refetchSessions }] = createResource(orgId, organizationId => fetchChatSessions({ organizationId }));

  const models = () => modelsData()?.models ?? [];
  const currentModel = () => selectedModel();
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
    const content = (text ?? input()).trim();
    if (!content || isStreaming()) {
      return;
    }

    setInput('');
    if (textareaRef) {
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

  return (
    <div class="flex h-[calc(100vh-4rem)]">
      {/* History sidebar */}
      <Show when={showHistory()}>
        <div class="w-64 border-r bg-background shrink-0 flex flex-col">
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
                value={input()}
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
              <Show when={models().length > 0}>
                <DropdownMenu>
                  <DropdownMenuTrigger class="inline-flex items-center gap-1 h-6 px-2 rounded text-[11px] text-muted-foreground/60 hover:text-muted-foreground hover:bg-accent/50 transition-colors font-normal cursor-pointer select-none outline-none">
                    <div class={cn(
                      'size-1.5 rounded-full shrink-0',
                      models().find(m => m.id === currentModel())?.provider === 'anthropic' ? 'bg-orange-500' : 'bg-green-500',
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
                            m.provider === 'anthropic' ? 'bg-orange-500' : 'bg-green-500',
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
