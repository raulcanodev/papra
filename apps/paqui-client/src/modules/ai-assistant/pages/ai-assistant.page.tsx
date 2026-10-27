import type { Component, JSX } from 'solid-js';
import type { ChatMessage, ChatSession, ToolConfirmation } from '../ai-assistant.services';
import type { PendingAttachment } from '../components/chat-attachments';
import type { TranslationKeys } from '@/modules/i18n/locales.types';
import type { OrganizationNavigationCapability } from '@/modules/ui/navigation/organization-navigation';
import { useLocation, useNavigate, useParams } from '@solidjs/router';
import remarkGfm from 'remark-gfm';
import { createEffect, createResource, createSignal, For, on, onCleanup, onMount, Show } from 'solid-js';
import { SolidMarkdown } from 'solid-markdown';
import { toast } from 'solid-sonner';
import { isTouchDevice } from '@/modules/captures/captures.models';
import { isDemoMode } from '@/modules/config/config';
import { fetchDocument } from '@/modules/documents/documents.services';
import { getClassificationLabelKey } from '@/modules/finances/finances-labels';
import { useI18n } from '@/modules/i18n/i18n.provider';
import { cn } from '@/modules/shared/style/cn';
import { Button } from '@/modules/ui/components/button';
import { buildOrganizationSettingsNavigation, buildOrganizationWorkspaceNavigation } from '@/modules/ui/navigation/organization-navigation';
import { useNavigationCapabilities } from '@/modules/ui/navigation/use-navigation-capabilities';
import { useAiAssistantPanel } from '../ai-assistant-panel.provider';
import { deleteChatSession, executeToolAction, fetchChatSession, fetchChatSessions, renameChatSession, streamChatMessage, transcribeDictation, updateMessageMetadata, uploadChatAttachment } from '../ai-assistant.services';
import { getActionFailure, PendingActionsBar, ResolvedActionLine } from '../components/action-approval';
import { AttachmentChip, ChatAttachMenu, MAX_CHAT_ATTACHMENTS } from '../components/chat-attachments';
import { createVoiceDictation, isVoiceDictationSupported, VoiceWaveform } from '../components/voice-dictation';
import { buildPageContext } from '../page-context/build-page-context';
import { capturePageSnapshot } from '../page-context/capture-page-snapshot';

// Suggestions about bank transactions only for users with the personal finances module, like its tools on the server
const PLACEHOLDER_SUGGESTION_CONFIG: Array<{ icon: string; key: TranslationKeys; requires?: OrganizationNavigationCapability }> = [
  { icon: 'i-tabler-files', key: 'ai-assistant.suggestion.documents-overview' },
  { icon: 'i-tabler-file-search', key: 'ai-assistant.suggestion.find-invoices' },
  { icon: 'i-tabler-receipt-tax', key: 'ai-assistant.suggestion.quarterly-taxes' },
  { icon: 'i-tabler-clock-dollar', key: 'ai-assistant.suggestion.unpaid-invoices' },
  { icon: 'i-tabler-chart-bar', key: 'ai-assistant.suggestion.financial-summary', requires: 'personal-finances' },
  { icon: 'i-tabler-transfer', key: 'ai-assistant.suggestion.transfer-rules', requires: 'personal-finances' },
  { icon: 'i-tabler-tag', key: 'ai-assistant.suggestion.classify-rules', requires: 'personal-finances' },
  { icon: 'i-tabler-help', key: 'ai-assistant.suggestion.unclassified', requires: 'personal-finances' },
];

// The public demo only has invoices to talk about.
const DEMO_SUGGESTION_CONFIG = [
  { icon: 'i-tabler-clock-dollar', key: 'ai-assistant.suggestion.demo-unpaid' as const },
  { icon: 'i-tabler-chart-bar', key: 'ai-assistant.suggestion.demo-total' as const },
  { icon: 'i-tabler-users', key: 'ai-assistant.suggestion.demo-customers' as const },
];

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
  const { t } = useI18n();
  return (
    <div class="not-prose my-2 rounded-lg border border-border/60 bg-card/50 overflow-hidden">
      <div class="flex items-center gap-2 px-3 py-2 bg-muted/30 border-b border-border/40">
        <div class="i-tabler-rule size-4 text-primary/70" />
        <span class="text-sm font-medium text-foreground">{props.rule.name}</span>
      </div>
      <div class="px-3 py-2 space-y-1.5">
        <Show when={props.rule.classification}>
          <div class="flex items-center gap-2">
            <span class="text-xs text-muted-foreground">{t('ai-assistant.rule.classification')}</span>
            <span class={cn('text-xs font-medium px-1.5 py-0.5 rounded', CLASSIFICATION_COLORS[props.rule.classification!] ?? 'text-foreground bg-muted')}>
              {getClassificationLabelKey(props.rule.classification!) ? t(getClassificationLabelKey(props.rule.classification!)!) : props.rule.classification}
            </span>
          </div>
        </Show>
        <Show when={props.rule.conditions && props.rule.conditions.length > 0}>
          <div class="flex items-start gap-2">
            <span class="text-xs text-muted-foreground mt-0.5 shrink-0">
              {props.rule.matchMode === 'any' ? t('ai-assistant.rule.any-of') : t('ai-assistant.rule.all-of')}
            </span>
            <div class="flex flex-col gap-1">
              <For each={props.rule.conditions}>
                {cond => (
                  <div class="text-xs flex items-center gap-1">
                    <span class="font-medium text-foreground">{cond.field}</span>
                    <span class="text-muted-foreground">{cond.operator}</span>
                    <span class="font-mono text-primary bg-primary/5 px-1 rounded">
                      "
                      {cond.value}
                      "
                    </span>
                  </div>
                )}
              </For>
            </div>
          </div>
        </Show>
        <Show when={props.rule.tags && props.rule.tags.length > 0}>
          <div class="flex items-center gap-2">
            <span class="text-xs text-muted-foreground">{t('ai-assistant.rule.tags')}</span>
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
  if (typeof children === 'string') {
    return children;
  }
  if (Array.isArray(children)) {
    return children.map(getTextContent).join('');
  }
  return String(children ?? '');
}

// Clean up AI content: strip tool result markers and paqui-* fences, re-wrap JSON properly
function preprocessMessageContent(content: string): string {
  // 0. Strip [APPROVED: ...] and [SKIPPED: ...] markers (tool result context not meant for display)
  let cleaned = content.replace(/\[(?:APPROVED|SKIPPED):\s*\w+(?:\s+Result:\s*\{[\s\S]*?\})?\]/g, '');

  // 1. Remove any paqui-rule/paqui-data fence markers (open and close), leaving just the JSON
  cleaned = cleaned.replace(/```paqui-(rule|data)\s*/g, '');
  cleaned = cleaned.replace(/```\s*(?=\n|$)/g, (match, offset: number) => {
    // Only strip closing ``` that look like they close a paqui fence (preceded by JSON-like content)
    const before = cleaned.slice(Math.max(0, offset - 200), offset);
    if (/\}\s*$/.test(before)) {
      return '';
    }
    return match;
  });

  // 2. Find standalone JSON objects on their own line and wrap them
  cleaned = cleaned.replace(/(?:^|\n)\s*(\{[^\n]*\})\s*(?:\n|$)/g, (match, json: string) => {
    try {
      const parsed = JSON.parse(json) as Record<string, unknown>;
      if (parsed.title || parsed.columns || parsed.items) {
        return `\n\`\`\`paqui-data\n${json}\n\`\`\`\n`;
      }
      if (parsed.name && (parsed.classification || parsed.conditions)) {
        return `\n\`\`\`paqui-rule\n${json}\n\`\`\`\n`;
      }
    } catch { /* not valid JSON, leave as-is */ }
    return match;
  });

  // 3. Collapse excessive whitespace left by stripped markers
  cleaned = cleaned.replace(/\n{3,}/g, '\n\n').trim();

  return cleaned;
}

function CodeBlock(props: { lang?: string; code: string; class?: string; children?: JSX.Element }) {
  const { t } = useI18n();
  const [copied, setCopied] = createSignal(false);

  const copyToClipboard = async () => {
    await navigator.clipboard.writeText(props.code);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div class="relative my-2 rounded-md bg-muted overflow-hidden group">
      <div class="flex items-center justify-between px-3 py-1.5 bg-muted-foreground/10 text-xs text-muted-foreground">
        <span>{props.lang || 'code'}</span>
        <button
          type="button"
          onClick={copyToClipboard}
          class="flex items-center gap-1 px-1.5 py-0.5 rounded hover:bg-muted-foreground/15 transition-colors text-muted-foreground/70 hover:text-muted-foreground"
        >
          <div class={copied() ? 'i-tabler-check text-green-500' : 'i-tabler-copy'} style={{ 'font-size': '14px' }} />
          <span>{copied() ? t('ai-assistant.code.copied') : t('ai-assistant.code.copy')}</span>
        </button>
      </div>
      <pre class="p-3 overflow-x-auto text-sm leading-relaxed"><code class={props.class}>{props.children}</code></pre>
    </div>
  );
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

    if (lang === 'paqui-rule') {
      try {
        const data = JSON.parse(raw) as RuleCardData;
        return <RulePreviewCard rule={data} />;
      } catch { /* fall through */ }
    }

    if (lang === 'paqui-data') {
      try {
        const data = JSON.parse(raw) as DataCardData;
        return <DataDisplayCard data={data} />;
      } catch { /* fall through */ }
    }

    // Default code block
    return <CodeBlock lang={lang} code={raw} class={props.className}>{props.children}</CodeBlock>;
  },
};

const TOOL_ACTIVITY_LABELS: Record<string, { icon: string; labelKey: TranslationKeys }> = {
  webSearch: { icon: 'i-tabler-world-search', labelKey: 'ai-assistant.activity.web-search' },
  searchDocuments: { icon: 'i-tabler-file-search', labelKey: 'ai-assistant.activity.search-documents' },
  getDocumentById: { icon: 'i-tabler-file-text', labelKey: 'ai-assistant.activity.read-document' },
  listTransactions: { icon: 'i-tabler-list-search', labelKey: 'ai-assistant.activity.load-transactions' },
  searchTransactions: { icon: 'i-tabler-search', labelKey: 'ai-assistant.activity.search-transactions' },
  getSpendingBreakdown: { icon: 'i-tabler-chart-pie', labelKey: 'ai-assistant.activity.spending' },
  getAccountBalances: { icon: 'i-tabler-wallet', labelKey: 'ai-assistant.activity.balances' },
  getFinancialOverview: { icon: 'i-tabler-report-analytics', labelKey: 'ai-assistant.activity.overview' },
  analyzeUnclassifiedTransactions: { icon: 'i-tabler-analyze', labelKey: 'ai-assistant.activity.analyze-transactions' },
  listClassificationRules: { icon: 'i-tabler-tags', labelKey: 'ai-assistant.activity.rules' },
  listTaggingRules: { icon: 'i-tabler-tags', labelKey: 'ai-assistant.activity.rules' },
  autoClassifyTransactions: { icon: 'i-tabler-robot', labelKey: 'ai-assistant.activity.classify' },
  getUserProfile: { icon: 'i-tabler-user-check', labelKey: 'ai-assistant.activity.read-profile' },
  updateUserProfile: { icon: 'i-tabler-user-edit', labelKey: 'ai-assistant.activity.update-profile' },
};

// One line for whatever Paqui is doing, the latest tool when several run at once
function ToolActivityIndicator(props: { toolNames: string[] }) {
  const { t } = useI18n();
  const info = () => {
    const known = [...props.toolNames].reverse().find(name => TOOL_ACTIVITY_LABELS[name]);
    const activity = known ? TOOL_ACTIVITY_LABELS[known]! : { icon: 'i-tabler-hammer', labelKey: 'ai-assistant.activity.working' as const };
    return { icon: activity.icon, label: t(activity.labelKey) };
  };

  return (
    <div class="flex items-center gap-2 py-1 text-sm text-muted-foreground">
      <div class={cn(info().icon, 'size-4 shrink-0 animate-pulse')} />
      <span>{info().label}</span>
    </div>
  );
}

function WebSourceBadges(props: { sources: Array<{ title: string; url: string }> }) {
  const { t } = useI18n();
  return (
    <div class="not-prose flex flex-wrap gap-1.5 mt-3 pt-2 border-t border-border/30">
      <span class="text-xs text-muted-foreground/60 self-center mr-0.5">{t('ai-assistant.sources')}</span>
      <For each={props.sources}>
        {(source) => {
          const hostname = () => {
            try {
              return new URL(source.url).hostname.replace('www.', '');
            } catch {
              return source.url;
            }
          };
          return (
            <a
              href={source.url}
              target="_blank"
              rel="noopener noreferrer"
              class="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-muted hover:bg-muted-foreground/15 border border-border/40 text-xs text-muted-foreground hover:text-foreground transition-colors no-underline truncate max-w-48"
              title={source.title}
            >
              <div class="i-tabler-external-link size-3 shrink-0" />
              <span class="truncate">{hostname()}</span>
            </a>
          );
        }}
      </For>
    </div>
  );
}

const MessageBubble: Component<{ message: ChatMessage; isStreaming?: boolean }> = (props) => {
  const { t } = useI18n();
  const isUser = () => props.message.role === 'user';
  const [thinkingOpen, setThinkingOpen] = createSignal(false);
  const hasThinking = () => !!props.message.thinking;
  const isThinkingLive = () => props.isStreaming && hasThinking() && !props.message.content;

  return (
    <div class={cn('flex gap-3 py-4', isUser() ? 'flex-row-reverse' : 'flex-row')}>

      <div class={cn('flex flex-col gap-1 min-w-0 flex-1', isUser() ? 'items-end' : 'items-start')}>
        <Show when={isUser()}>
          <Show when={(props.message.attachments ?? []).length > 0}>
            <div class="flex flex-wrap justify-end gap-1.5 max-w-full">
              <For each={props.message.attachments}>
                {attachment => <AttachmentChip name={attachment.name} mimeType={attachment.mimeType} size={attachment.size} />}
              </For>
            </div>
          </Show>
          <Show when={props.message.content}>
            <div class="rounded-2xl bg-muted text-foreground rounded-tr-sm px-4 py-2.5 text-sm leading-relaxed whitespace-pre-wrap [overflow-wrap:anywhere] max-w-full">
              {props.message.content}
            </div>
          </Show>
        </Show>
        <Show when={!isUser()}>
          <div class="text-sm leading-relaxed break-words min-w-0 [overflow-wrap:anywhere] max-w-full prose prose-sm prose-neutral dark:prose-invert prose-p:my-1 prose-ul:my-1 prose-ol:my-1 prose-li:my-0.5 prose-headings:my-2 prose-pre:my-2 prose-pre:bg-muted prose-pre:text-foreground prose-code:text-foreground prose-code:before:content-none prose-code:after:content-none">
            <Show when={hasThinking()}>
              <Show when={isThinkingLive()}>
                <div class="flex items-center gap-2 py-1.5 px-2 mb-2 rounded-md bg-muted/50 border border-border/50 text-muted-foreground text-xs">
                  <div class="i-tabler-brain size-3.5 animate-pulse" />
                  <span class="font-medium">{t('ai-assistant.thinking.live')}</span>
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
                  <span>{t('ai-assistant.thinking')}</span>
                </button>
                <Show when={thinkingOpen()}>
                  <div class="mb-2 py-2 px-3 rounded-md bg-muted/30 border border-border/40 text-xs text-muted-foreground leading-relaxed whitespace-pre-wrap max-h-60 overflow-y-auto">
                    {props.message.thinking}
                  </div>
                </Show>
              </Show>
            </Show>
            <Show when={!props.message.content && props.isStreaming && !isThinkingLive()}>
              <Show
                when={(props.message.activeToolCalls ?? []).length > 0}
                fallback={(
                  <div class="flex items-center gap-1.5 py-1 text-muted-foreground">
                    <div class="size-1.5 rounded-full bg-current animate-pulse" />
                    <div class="size-1.5 rounded-full bg-current animate-pulse" style={{ 'animation-delay': '0.15s' }} />
                    <div class="size-1.5 rounded-full bg-current animate-pulse" style={{ 'animation-delay': '0.3s' }} />
                  </div>
                )}
              >
                <ToolActivityIndicator toolNames={props.message.activeToolCalls!} />
              </Show>
            </Show>
            <Show when={props.message.content}>
              <SolidMarkdown remarkPlugins={[remarkGfm]} components={markdownComponents} children={preprocessMessageContent(props.message.content)} />
              <Show when={props.isStreaming}>
                <span class="inline-block w-0.5 h-4 bg-foreground ml-0.5 align-middle animate-pulse" />
              </Show>
              <Show when={!props.isStreaming && (props.message.webSources ?? []).length > 0}>
                <WebSourceBadges sources={props.message.webSources!} />
              </Show>
            </Show>
            {/* Pending actions are answered in the bar above the input, here only what was decided */}
            <For each={(props.message.toolConfirmations ?? []).filter(confirmation => confirmation.status !== 'pending')}>
              {confirmation => <ResolvedActionLine confirmation={confirmation} />}
            </For>
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
  const { t } = useI18n();
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
      fallback={(
        <div class="w-full px-3 py-1.5 rounded-lg bg-muted flex items-center gap-2">
          <input
            ref={inputRef}
            class="min-h-11 flex-1 text-base sm:text-sm bg-transparent outline-none min-w-0"
            value={props.session.title}
            onBlur={commitEdit}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                commitEdit();
              }
              if (e.key === 'Escape') {
                setEditing(false);
              }
            }}
          />
        </div>
      )}
    >
      <div class={cn('flex w-full min-w-0 items-center gap-1 rounded-lg px-2 group', props.isActive ? 'bg-muted font-medium' : 'hover:bg-muted/50 text-muted-foreground')}>
        <button type="button" class="flex min-h-11 min-w-0 flex-1 items-center gap-2 text-left text-sm" onClick={() => props.onSelect()}>
          <div class="i-tabler-message size-3.5 shrink-0 opacity-50" />
          <span class="truncate">{props.session.title}</span>
        </button>
        <button
          type="button"
          aria-label={t('ai-assistant.history.rename')}
          class="flex size-11 sm:size-7 shrink-0 items-center justify-center rounded-md text-muted-foreground sm:opacity-0 group-hover:opacity-100 focus-visible:opacity-100 hover:bg-muted"
          onClick={startEdit}
        >
          <div class="i-tabler-pencil size-4" />
        </button>
        <button
          type="button"
          aria-label={t('ai-assistant.history.delete')}
          class="flex size-11 sm:size-7 shrink-0 items-center justify-center rounded-md text-muted-foreground sm:opacity-0 group-hover:opacity-100 focus-visible:opacity-100 hover:bg-muted"
          onClick={() => props.onDelete()}
        >
          <div class="i-tabler-x size-4" />
        </button>
      </div>
    </Show>
  );
};

type AiAssistantProps = {
  mode?: 'page' | 'panel';
  onClose?: () => void;
  onExpand?: () => void;
};

export const AiAssistant: Component<AiAssistantProps> = (props) => {
  const { t, getLocale } = useI18n();
  const params = useParams();
  const location = useLocation();
  const navigate = useNavigate();
  const assistantPanel = useAiAssistantPanel();
  const getNavigationCapabilities = useNavigationCapabilities();
  const [messages, setMessages] = createSignal<ChatMessage[]>([]);
  const [hasInput, setHasInput] = createSignal(false);
  const [isStreaming, setIsStreaming] = createSignal(false);
  const [activeChatId, setActiveChatId] = createSignal<string | undefined>(sessionStorage.getItem('paqui-ai-chat') ?? undefined);
  const [showHistory, setShowHistory] = createSignal(false);
  const [pendingAttachments, setPendingAttachments] = createSignal<PendingAttachment[]>([]);
  const [busyActionIds, setBusyActionIds] = createSignal<string[]>([]);
  const [actionErrors, setActionErrors] = createSignal<Record<string, string>>({});
  const [isAskingSomethingElse, setIsAskingSomethingElse] = createSignal(false);
  const [isDraggingFiles, setIsDraggingFiles] = createSignal(false);
  let abortController: AbortController | undefined;
  let pendingNavigation: string | undefined;
  let messagesScrollRef: HTMLDivElement | undefined;
  let textareaRef: HTMLTextAreaElement | undefined;

  const orgId = () => params.organizationId;
  const isPanel = () => props.mode === 'panel';

  // Everything the assistant needs to know about the screen, captured when the message is sent
  function collectPageContext() {
    const navigationArgs = { organizationId: orgId(), capabilities: getNavigationCapabilities(), translate: t };

    return buildPageContext({
      organizationId: orgId(),
      pathname: location.pathname,
      search: location.search,
      title: document.title,
      snapshot: capturePageSnapshot({ root: document.querySelector('main') }),
      menuSections: [...buildOrganizationWorkspaceNavigation(navigationArgs), ...buildOrganizationSettingsNavigation(navigationArgs)],
    });
  }

  // The assistant moves the user once its answer is complete, so the text is never cut by the page change.
  // From the full-screen assistant the conversation continues in the side panel next to the destination.
  function goToPage(path: string) {
    if (!isPanel()) {
      assistantPanel.open();
    }

    navigate(path);
  }

  let metadataUpdates = Promise.resolve();

  function handleToolStatusChange(toolCallId: string, status: 'approved' | 'rejected', result?: unknown) {
    setMessages((prev) => {
      const updated = prev.map((msg) => {
        if (!msg.toolConfirmations?.some(tc => tc.toolCallId === toolCallId)) {
          return msg;
        }
        const updatedConfs = msg.toolConfirmations.map(tc =>
          tc.toolCallId === toolCallId ? { ...tc, status, result } : tc,
        );
        if (updatedConfs === msg.toolConfirmations) {
          return msg;
        }
        const updatedMsg = { ...msg, toolConfirmations: updatedConfs };
        // Persist to server if we have message id and session
        if (updatedMsg.id && activeChatId()) {
          const metadata = JSON.stringify({
            webSources: updatedMsg.webSources ?? [],
            toolConfirmations: updatedConfs,
          });
          const target = { organizationId: orgId(), sessionId: activeChatId()!, messageId: updatedMsg.id, metadata };
          metadataUpdates = metadataUpdates.then(() => updateMessageMetadata(target)).then(() => {}).catch(() => {
            toast.error(t('ai-assistant.approval.save-failed'));
          });
        }
        return updatedMsg;
      });
      return updated;
    });
  }
  // The actions still waiting for a yes or no, answered in the bar above the input. Only those of the
  // latest answer: once the user wrote again, older ones are stale even if their answer was never saved
  const pendingConfirmations = () => (isStreaming()
    ? []
    : messages()
        .slice(messages().findLastIndex(message => message.role === 'user') + 1)
        .flatMap(message => (message.toolConfirmations ?? []).filter(confirmation => confirmation.status === 'pending')));

  async function approveAction(confirmation: ToolConfirmation) {
    if (busyActionIds().length > 0) {
      return false;
    }
    setActionErrors(errors => ({ ...errors, [confirmation.toolCallId]: '' }));
    setBusyActionIds(ids => [...ids, confirmation.toolCallId]);
    try {
      const result = await executeToolAction({ organizationId: orgId(), toolName: confirmation.toolName, args: confirmation.args });
      const failure = getActionFailure({ confirmation: { ...confirmation, result } });
      if (failure) {
        setActionErrors(errors => ({ ...errors, [confirmation.toolCallId]: failure }));
        return false;
      }
      handleToolStatusChange(confirmation.toolCallId, 'approved', result);
      return true;
    } catch (error) {
      setActionErrors(errors => ({ ...errors, [confirmation.toolCallId]: error instanceof Error ? error.message : t('ai-assistant.error.generic') }));
      return false;
    } finally {
      setBusyActionIds(ids => ids.filter(id => id !== confirmation.toolCallId));
    }
  }

  // One after the other: a later action may need what an earlier one created
  async function approveAllActions() {
    for (const confirmation of pendingConfirmations()) {
      if (!await approveAction(confirmation)) {
        break;
      }
    }
  }

  function askSomethingElse() {
    setIsAskingSomethingElse(true);
    textareaRef?.focus();
  }

  const [sessionsData, { refetch: refetchSessions }] = createResource(orgId, organizationId => fetchChatSessions({ organizationId }));

  const sessions = () => sessionsData()?.sessions ?? [];
  const suggestions = () => (isDemoMode ? DEMO_SUGGESTION_CONFIG : PLACEHOLDER_SUGGESTION_CONFIG.filter(suggestion => suggestion.requires === undefined || getNavigationCapabilities()[suggestion.requires]))
    .map(suggestion => ({ icon: suggestion.icon, text: t(suggestion.key) }));

  function setActiveChat(id: string | undefined) {
    setActiveChatId(id);
    if (id) {
      sessionStorage.setItem('paqui-ai-chat', id);
    } else {
      sessionStorage.removeItem('paqui-ai-chat');
    }
  }

  onCleanup(() => {
    abortController?.abort();
  });

  // A question asked from a page ("Preguntar a Paqui") starts a chat of its own, once the current answer is done
  let hasAskedFromPage = false;
  createEffect(on([assistantPanel.pendingPrompt, isStreaming, () => busyActionIds().length], ([prompt, streaming, busyActions]) => {
    if (prompt === undefined || streaming || busyActions > 0) {
      return;
    }
    hasAskedFromPage = true;
    handleNewChat();
    void sendMessage(assistantPanel.takePendingPrompt());
  }));

  // Restore last active chat on mount
  onMount(async () => {
    const storedChatId = sessionStorage.getItem('paqui-ai-chat');
    if (!storedChatId || hasAskedFromPage) {
      return;
    }
    try {
      const data = await fetchChatSession({ organizationId: orgId(), sessionId: storedChatId });
      if (hasAskedFromPage) {
        return;
      }
      setActiveChatId(storedChatId);
      setMessages(data.messages);
      scrollToBottom();
    } catch {
      sessionStorage.removeItem('paqui-ai-chat');
    }
  });

  function scrollToBottom() {
    requestAnimationFrame(() => {
      if (!messagesScrollRef) {
        return;
      }

      messagesScrollRef.scrollTo({ top: messages().length > 0 ? messagesScrollRef.scrollHeight : 0, behavior: 'smooth' });
    });
  }

  function autoResizeTextarea() {
    if (!textareaRef) {
      return;
    }
    // Use overflow:hidden + height:0 to measure content height without layout cascade
    textareaRef.style.overflowY = 'hidden';
    textareaRef.style.height = '0px';
    const desired = Math.min(textareaRef.scrollHeight, 160);
    textareaRef.style.height = `${desired}px`;
    textareaRef.style.overflowY = desired >= 160 ? 'auto' : 'hidden';
  }

  // The dictated text lands in the input, after what was already written, to be read over before sending
  const dictation = createVoiceDictation({
    onRecorded: async ({ audio, fileName }) => {
      const { text } = await transcribeDictation({ organizationId: orgId(), audio, fileName, language: getLocale().slice(0, 2) });
      if (!text) {
        toast.info(t('ai-assistant.voice.empty'));
        return;
      }
      if (!textareaRef) {
        return;
      }
      const current = textareaRef.value.trimEnd();
      textareaRef.value = current ? `${current} ${text}` : text;
      setHasInput(true);
      requestAnimationFrame(() => {
        autoResizeTextarea();
        // On a phone the keyboard would cover the answer: the text is there to send or tap to edit
        if (!isTouchDevice()) {
          textareaRef?.focus();
          textareaRef?.setSelectionRange(textareaRef.value.length, textareaRef.value.length);
        }
      });
    },
    onError: ({ reason }) => toast.error(t(`ai-assistant.voice.${reason}`)),
  });
  const isDictating = () => dictation.state() !== 'idle';

  const readyAttachments = () => pendingAttachments().flatMap(pending => (pending.status === 'ready' && pending.attachment ? [pending.attachment] : []));
  const isUploadingAttachments = () => pendingAttachments().some(pending => pending.status === 'uploading');
  const updatePendingAttachment = (key: string, changes: Partial<PendingAttachment>) => setPendingAttachments(current => current.map(pending => (pending.key === key ? { ...pending, ...changes } : pending)));
  let nextAttachmentKey = 0;

  // Uploaded right away: by the time the message is sent the files are documents the assistant can read
  function addAttachmentFiles(files: File[]) {
    const room = MAX_CHAT_ATTACHMENTS - pendingAttachments().length;
    for (const file of files.slice(0, Math.max(room, 0))) {
      const key = `attachment-${nextAttachmentKey++}`;
      setPendingAttachments(current => [...current, { key, name: file.name, mimeType: file.type, size: file.size, status: 'uploading' }]);
      uploadChatAttachment({ organizationId: orgId(), file })
        .then(({ attachment }) => updatePendingAttachment(key, { status: 'ready', attachment, name: attachment.name }))
        .catch(() => updatePendingAttachment(key, { status: 'error' }));
    }
  }

  // Photos sent from the phone are documents already
  function addAttachmentDocuments(documentIds: string[]) {
    for (const documentId of documentIds.slice(0, Math.max(MAX_CHAT_ATTACHMENTS - pendingAttachments().length, 0))) {
      const key = `attachment-${nextAttachmentKey++}`;
      setPendingAttachments(current => [...current, { key, name: '…', mimeType: 'image/jpeg', size: 0, status: 'uploading' }]);
      fetchDocument({ organizationId: orgId(), documentId })
        .then(({ document }) => updatePendingAttachment(key, { status: 'ready', name: document.name, mimeType: document.mimeType, size: document.originalSize, attachment: { documentId, name: document.name, mimeType: document.mimeType, size: document.originalSize } }))
        .catch(() => updatePendingAttachment(key, { status: 'error' }));
    }
  }

  async function sendMessage(text?: string) {
    const content = (text ?? textareaRef?.value ?? '').trim();
    const attachments = text === undefined ? readyAttachments() : [];
    if ((!content && attachments.length === 0) || isStreaming() || busyActionIds().length > 0 || (text === undefined && isUploadingAttachments())) {
      return;
    }

    if (text === undefined) {
      setPendingAttachments([]);
    }

    // Writing instead of answering turns down what was still waiting: the message says what to do instead
    for (const confirmation of pendingConfirmations()) {
      handleToolStatusChange(confirmation.toolCallId, 'rejected');
    }
    setIsAskingSomethingElse(false);

    setHasInput(false);
    if (textareaRef) {
      textareaRef.value = '';
      textareaRef.style.height = 'auto';
    }

    const userMessage: ChatMessage = { role: 'user', content, ...(attachments.length > 0 ? { attachments } : {}) };
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
        sessionId: activeChatId(),
        pageContext: collectPageContext(),
        signal: abortController.signal,
        onNavigate: (navigation) => {
          pendingNavigation = navigation.path;
        },
        onAssistantMessageId: (id) => {
          setMessages(prev => prev.map((message, index) => (index === prev.length - 1 && message.role === 'assistant' ? { ...message, id } : message)));
        },
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
              { ...last, content: last.content + chunk, activeToolCalls: undefined },
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
              { ...last, toolConfirmations: [...(last.toolConfirmations ?? []), confirmation], activeToolCalls: undefined },
            ];
          });
          scrollToBottom();
        },
        onToolActivity: (toolName) => {
          setMessages((prev) => {
            const last = prev[prev.length - 1];
            if (!last || last.role !== 'assistant') {
              return prev;
            }
            const current = last.activeToolCalls ?? [];
            if (current.includes(toolName)) {
              return prev;
            }
            return [
              ...prev.slice(0, -1),
              { ...last, activeToolCalls: [...current, toolName] },
            ];
          });
        },
        onToolDone: (toolName) => {
          setMessages((prev) => {
            const last = prev[prev.length - 1];
            if (!last || last.role !== 'assistant') {
              return prev;
            }
            const current = (last.activeToolCalls ?? []).filter(t => t !== toolName);
            return [
              ...prev.slice(0, -1),
              { ...last, activeToolCalls: current.length > 0 ? current : undefined },
            ];
          });
        },
        onWebSources: (sources) => {
          setMessages((prev) => {
            const last = prev[prev.length - 1];
            if (!last || last.role !== 'assistant') {
              return prev;
            }
            return [
              ...prev.slice(0, -1),
              { ...last, webSources: [...(last.webSources ?? []), ...sources] },
            ];
          });
        },
      });
    } catch (error: unknown) {
      if (error instanceof Error && error.name === 'AbortError') {
        return;
      }

      const errorMessage = error instanceof Error ? error.message : t('ai-assistant.error.generic');
      setMessages((prev) => {
        const last = prev[prev.length - 1];
        if (!last || last.role !== 'assistant') {
          return [...prev, { role: 'assistant', content: t('ai-assistant.error.prefix', { message: errorMessage }) }];
        }
        return [
          ...prev.slice(0, -1),
          { ...last, content: last.content || t('ai-assistant.error.prefix', { message: errorMessage }) },
        ];
      });
    } finally {
      setIsStreaming(false);
      abortController = undefined;

      if (pendingNavigation !== undefined) {
        goToPage(pendingNavigation);
        pendingNavigation = undefined;
      }

      void refetchSessions();
      requestAnimationFrame(() => textareaRef?.focus({ preventScroll: true }));
    }
  }

  function handleKeyDown(e: KeyboardEvent) {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      void sendMessage();
    }
  }

  function handleNewChat() {
    if (busyActionIds().length > 0) {
      return;
    }
    setActionErrors({});
    setIsAskingSomethingElse(false);
    setShowHistory(false);
    abortController?.abort();
    setMessages([]);
    setPendingAttachments([]);
    setHasInput(false);
    if (textareaRef) {
      textareaRef.value = '';
      textareaRef.style.height = 'auto';
    }
    setIsStreaming(false);
    setActiveChat(undefined);
  }

  async function loadChat(session: ChatSession) {
    if (busyActionIds().length > 0) {
      return;
    }
    await metadataUpdates;
    setActionErrors({});
    setIsAskingSomethingElse(false);
    setShowHistory(false);
    abortController?.abort();
    setIsStreaming(false);

    const data = await fetchChatSession({ organizationId: orgId(), sessionId: session.id });
    setActiveChat(session.id);
    setShowHistory(false);
    setMessages(data.messages);
    scrollToBottom();
  }

  async function handleDeleteChat(sessionId: string) {
    if (busyActionIds().length > 0) {
      return;
    }
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

  // Full width of its container: otherwise it shrinks to its content while the answer is still empty
  return (
    <div class="relative flex h-full w-full min-w-0 min-h-0 bg-white dark:bg-card" data-agent-ignore>
      {/* History sidebar */}
      <Show when={showHistory()}>
        <div class={cn(
          'border-r bg-white dark:bg-card shrink-0 flex flex-col min-h-0 h-full',
          isPanel() ? 'absolute inset-0 z-20 w-full' : 'absolute inset-0 z-20 w-full md:relative md:inset-auto md:z-auto md:w-64',
        )}
        >
          <div class="p-3 border-b flex items-center justify-between">
            <span class="text-xs font-semibold text-muted-foreground uppercase tracking-wide">{t('ai-assistant.history.title')}</span>
            <button
              type="button"
              class="flex size-11 sm:size-6 items-center justify-center text-muted-foreground hover:text-foreground transition-colors"
              aria-label={t('ai-assistant.history.close')}
              onClick={() => setShowHistory(false)}
            >
              <div class="i-tabler-x size-5" />
            </button>
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
      <div class="flex flex-col flex-1 min-w-0 min-h-0">
        {/* Header */}
        <div class={cn('border-b flex items-center justify-between shrink-0 bg-white dark:bg-card', isPanel() ? 'px-3 py-2' : 'px-3 sm:px-5 py-2.5')}>
          <div class="flex items-center gap-2">
            <Button
              type="button"
              size="sm"
              class="h-11 sm:h-7 px-2.5 text-xs"
              aria-expanded={showHistory()}
              onClick={() => setShowHistory(!showHistory())}
            >
              {t('ai-assistant.history.title')}
            </Button>
            <Button size="sm" class="h-11 sm:h-7 px-2.5 text-xs" onClick={handleNewChat}>
              {t('ai-assistant.new-chat')}
            </Button>
            <div class={cn('hidden md:flex items-center gap-2', isPanel() && 'sr-only')}>
              <img src="/logo.svg" alt="Paqui" class="size-8 shrink-0 [image-rendering:pixelated]" />
              <div>
                <p class="text-xs text-muted-foreground mt-0.5">{t('ai-assistant.subtitle')}</p>
              </div>
            </div>
          </div>
          <div class="flex items-center gap-2">
            <Show when={isPanel()}>
              <Button variant="ghost" size="icon-sm" class="size-11 sm:size-8 shrink-0 rounded-full" onClick={props.onExpand} aria-label={t('ai-assistant.open-full-page')}>
                <div class="i-tabler-arrows-maximize size-4" />
              </Button>
              <Button variant="ghost" size="icon-sm" class="size-11 sm:size-8 shrink-0 rounded-full" onClick={props.onClose} aria-label={t('ai-assistant.close-panel')}>
                <div class="i-tabler-x size-4" />
              </Button>
            </Show>
          </div>
        </div>

        {/* Messages area */}
        <div ref={messagesScrollRef} class="min-h-0 min-w-0 flex-1 overflow-y-auto overscroll-contain">
          <div class={cn('mx-auto w-full', isPanel() ? 'max-w-xl px-4' : 'max-w-3xl px-3 sm:px-6')}>
            <Show
              when={messages().length > 0}
              fallback={(
                <div class={cn('flex flex-col items-center justify-center h-full gap-8 py-10', isPanel() ? 'min-h-[28rem]' : 'min-h-[calc(100dvh-14rem)]')}>
                  <div class="text-center">
                    <img src="/logo.svg" alt="Paqui" class="mx-auto mb-3 size-14 [image-rendering:pixelated]" />
                    <p class="text-muted-foreground text-sm max-w-md">
                      {t('ai-assistant.welcome.description')}
                    </p>
                  </div>
                  <div class={cn('grid grid-cols-1 gap-3 max-w-xl w-full', !isPanel() && 'sm:grid-cols-2')}>
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
            <div class="h-4" />
          </div>
        </div>

        {/* Input area */}
        <div data-composer class={cn('bg-white dark:bg-card flex flex-col shrink-0 min-h-0 max-h-[65%]', isPanel() ? 'px-3 pt-3 pb-[max(0.75rem,env(safe-area-inset-bottom))]' : 'px-3 py-3 sm:px-6 sm:py-4')}>
          <div class="mx-auto flex min-h-0 w-full max-w-3xl flex-col">
            <Show when={pendingConfirmations().length > 0}>
              <PendingActionsBar
                confirmations={pendingConfirmations()}
                busyIds={busyActionIds()}
                errors={actionErrors()}
                onApprove={confirmation => void approveAction(confirmation)}
                onApproveAll={() => void approveAllActions()}
                onReject={confirmation => handleToolStatusChange(confirmation.toolCallId, 'rejected')}
                onSomethingElse={askSomethingElse}
              />
            </Show>
            <div
              class={cn('relative flex shrink-0 flex-col rounded-2xl border border-border bg-background shadow-sm transition-shadow focus-within:ring-1 focus-within:ring-ring', isDraggingFiles() && 'ring-2 ring-primary/60')}
              onDragOver={(event) => {
                if (event.dataTransfer?.types.includes('Files')) {
                  event.preventDefault();
                  setIsDraggingFiles(true);
                }
              }}
              onDragLeave={() => setIsDraggingFiles(false)}
              onDrop={(event) => {
                setIsDraggingFiles(false);
                const files = [...(event.dataTransfer?.files ?? [])];
                if (files.length > 0) {
                  event.preventDefault();
                  addAttachmentFiles(files);
                }
              }}
            >
              <Show when={pendingAttachments().length > 0}>
                <div class="flex max-h-24 overflow-y-auto overscroll-contain flex-wrap gap-1.5 px-3 pt-3">
                  <For each={pendingAttachments()}>
                    {pending => (
                      <AttachmentChip
                        name={pending.name}
                        mimeType={pending.mimeType}
                        size={pending.size}
                        status={pending.status}
                        onRemove={() => setPendingAttachments(current => current.filter(item => item.key !== pending.key))}
                      />
                    )}
                  </For>
                </div>
              </Show>
              {/* Every control is exactly as tall as one line of text, so they stay aligned whatever the font */}
              <div class="flex items-end gap-1 p-1.5 sm:p-2">
                <Show
                  when={isDictating()}
                  fallback={(
                    <ChatAttachMenu
                      organizationId={orgId()}
                      disabled={isStreaming() || pendingAttachments().length >= MAX_CHAT_ATTACHMENTS}
                      onFiles={addAttachmentFiles}
                      onDocuments={addAttachmentDocuments}
                    />
                  )}
                >
                  <Button
                    variant="ghost"
                    size="sm"
                    class="size-11 sm:size-8 shrink-0 p-0 rounded-full text-muted-foreground"
                    aria-label={t('ai-assistant.voice.cancel')}
                    disabled={dictation.state() === 'transcribing'}
                    onClick={() => dictation.cancel()}
                  >
                    <div class="i-tabler-x size-5 sm:size-4" />
                  </Button>
                </Show>
                <Show when={dictation.state() === 'recording'}>
                  <VoiceWaveform levels={dictation.levels()} elapsedMs={dictation.elapsedMs()} class="h-11 sm:h-8 px-1" />
                </Show>
                <Show when={dictation.state() === 'transcribing'}>
                  <div class="flex h-11 sm:h-8 min-w-0 flex-1 items-center gap-2 px-1 text-base sm:text-sm text-muted-foreground" role="status">
                    <div class="i-tabler-loader-2 size-4 shrink-0 animate-spin" />
                    <span class="truncate">{t('ai-assistant.voice.transcribing')}</span>
                  </div>
                </Show>
                <textarea
                  ref={textareaRef}
                  placeholder={isAskingSomethingElse() ? t('ai-assistant.approval.something-else.placeholder') : t('ai-assistant.input.placeholder')}
                  onInput={(e) => {
                    setHasInput(!!e.currentTarget.value.trim());
                    autoResizeTextarea();
                  }}
                  onKeyDown={handleKeyDown}
                  onPaste={(event) => {
                    const files = [...(event.clipboardData?.files ?? [])];
                    if (files.length > 0) {
                      event.preventDefault();
                      addAttachmentFiles(files);
                    }
                  }}
                  disabled={isStreaming()}
                  rows={1}
                  class={cn(
                    'block min-w-0 flex-1 resize-none bg-transparent px-1 outline-none placeholder:text-muted-foreground disabled:opacity-50 max-h-[160px]',
                    'min-h-11 py-2.5 text-base leading-6 sm:min-h-8 sm:py-1.5 sm:text-sm sm:leading-5',
                    isDictating() && 'hidden',
                  )}
                />
                <div class="flex shrink-0 items-center gap-1">
                  <Show when={isStreaming()}>
                    <Button
                      variant="ghost"
                      size="sm"
                      class="size-11 sm:size-8 shrink-0 p-0 rounded-full"
                      aria-label={t('ai-assistant.input.stop')}
                      onClick={() => abortController?.abort()}
                    >
                      <div class="i-tabler-player-stop-filled size-4" />
                    </Button>
                  </Show>
                  {/* Not in the public demo: there is no transcription behind it */}
                  <Show when={isVoiceDictationSupported() && !isDemoMode && !isStreaming()}>
                    <Show
                      when={dictation.state() === 'recording'}
                      fallback={(
                        <Button
                          variant="ghost"
                          size="sm"
                          class="size-11 sm:size-8 shrink-0 p-0 rounded-full text-muted-foreground hover:text-foreground"
                          aria-label={t('ai-assistant.voice.start')}
                          disabled={dictation.state() === 'transcribing' || busyActionIds().length > 0}
                          onClick={() => void dictation.start()}
                        >
                          <div class="i-tabler-microphone size-5 sm:size-4.5" />
                        </Button>
                      )}
                    >
                      <Button
                        size="sm"
                        class="size-11 sm:size-8 shrink-0 p-0 rounded-full"
                        aria-label={t('ai-assistant.voice.stop')}
                        onClick={() => dictation.stop()}
                      >
                        <div class="size-3.5 rounded-[3px] bg-current" />
                      </Button>
                    </Show>
                  </Show>
                  <Show when={!isDictating()}>
                    <Button
                      size="sm"
                      class="size-11 sm:size-8 shrink-0 p-0 rounded-full border border-black/10 bg-white text-neutral-900 shadow-xs hover:bg-neutral-100"
                      aria-label={t('ai-assistant.input.send')}
                      onClick={() => void sendMessage()}
                      disabled={isStreaming() || busyActionIds().length > 0 || isUploadingAttachments() || (!hasInput() && readyAttachments().length === 0)}
                    >
                      <div class="i-tabler-arrow-up size-5 sm:size-4" />
                    </Button>
                  </Show>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export const AiAssistantPage: Component = () => <AiAssistant mode="page" />;
