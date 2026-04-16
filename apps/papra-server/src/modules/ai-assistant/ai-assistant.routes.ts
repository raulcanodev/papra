import type { RouteDefinitionContext } from '../app/server.types';
import { stepCountIs, streamText } from 'ai';
import { z } from 'zod';
import { requireAuthentication } from '../app/auth/auth.middleware';
import { getUser } from '../app/auth/auth.models';
import { requireFeatureFlag } from '../feature-flags/feature-flags.middleware';
import { organizationIdSchema } from '../organizations/organization.schemas.legacy';
import { createOrganizationsRepository } from '../organizations/organizations.repository';
import { ensureUserIsInOrganization } from '../organizations/organizations.usecases';
import { legacyValidateJsonBody, legacyValidateParams } from '../shared/validation/validation.legacy';
import { AI_CHAT_SESSION_ID_REGEX } from './ai-assistant.constants';
import { createAiNotConfiguredError } from './ai-assistant.errors';
import { createLlmModel, getConfiguredProviders, getDefaultModel } from './ai-assistant.providers';
import { createAiAssistantRepository } from './ai-assistant.repository';
import { createAssistantTools } from './ai-assistant.tools';

const SYSTEM_PROMPT = `You are Papra AI, an intelligent assistant embedded in the Papra document management platform. You help users manage their organization's documents, finances, and settings.

You have access to tools that let you:
- Search documents by name or content and retrieve document details
- View document storage statistics
- List and manage tags
- List tagging rules (auto-tagging conditions for documents)
- List and analyze financial transactions
- Search all transactions by counterparty/description and get aggregate stats
- Get spending breakdowns grouped by counterparty or classification
- Create classification rules to automatically categorize transactions
- Run auto-classification on unclassified transactions
- View financial overview and stats
- Check the organization's subscription status

When the user asks about documents:
1. Use searchDocuments to find or list documents (empty query lists all)
2. ALWAYS use getDocumentById to read the extracted text content of each document — searchDocuments only returns metadata, not content
3. Summarize the document content based on what you read

When the user asks about finances or transactions:
1. For aggregate questions (total spent at X, most common expense, etc.), use searchTransactions or getSpendingBreakdown — these scan ALL transaction history and do server-side calculations, so you get accurate totals
2. Use searchTransactions when the user asks about a specific counterparty or keyword (e.g., "how much did I spend at Ohana?"). Call it WITHOUT date filters to search the entire history. Only add dateFrom/dateTo if the user explicitly says a date range.
3. Use getSpendingBreakdown when the user asks for rankings, top expenses, most frequent, spending by category, etc. Again, do NOT add date filters unless explicitly asked.
4. NEVER use listTransactions for aggregate or search questions — it only paginates, it does not search. Use it only for browsing recent transactions.
5. When proposing classification rules, explain patterns found and create rules only after explaining your reasoning
6. After creating rules, offer to run auto-classification

IMPORTANT: Do NOT invent or guess date filters. If the user says "how much did I spend at X?", search ALL history without date restrictions. Only filter by date when the user explicitly says "in 2024", "last month", etc.

Always be concise and actionable. Use the organization's actual data to make informed suggestions.
When showing monetary amounts, format them as currency.
Respond in the same language as the user's message.`;

const AVAILABLE_MODELS = [
  { id: 'gpt-4o', provider: 'openai' as const, label: 'GPT-4o' },
  { id: 'gpt-4o-mini', provider: 'openai' as const, label: 'GPT-4o Mini' },
  { id: 'gpt-4.1', provider: 'openai' as const, label: 'GPT-4.1' },
  { id: 'gpt-4.1-mini', provider: 'openai' as const, label: 'GPT-4.1 Mini' },
  { id: 'gpt-4.1-nano', provider: 'openai' as const, label: 'GPT-4.1 Nano' },
  { id: 'gpt-4.5-preview', provider: 'openai' as const, label: 'GPT-4.5 Preview' },
  { id: 'o3', provider: 'openai' as const, label: 'o3' },
  { id: 'o3-mini', provider: 'openai' as const, label: 'o3-mini' },
  { id: 'o4-mini', provider: 'openai' as const, label: 'o4-mini' },
  { id: 'claude-sonnet-4-20250514', provider: 'anthropic' as const, label: 'Claude Sonnet 4' },
  { id: 'claude-opus-4-20250514', provider: 'anthropic' as const, label: 'Claude Opus 4' },
  { id: 'claude-3-5-sonnet-20241022', provider: 'anthropic' as const, label: 'Claude 3.5 Sonnet' },
  { id: 'claude-3-5-haiku-20241022', provider: 'anthropic' as const, label: 'Claude 3.5 Haiku' },
] as const;

const chatBodySchema = z.object({
  messages: z.array(z.object({
    role: z.enum(['user', 'assistant', 'system']),
    content: z.string(),
  })),
  model: z.string().optional(),
  sessionId: z.string().optional(),
});

const sessionIdParamSchema = z.object({
  organizationId: organizationIdSchema,
  sessionId: z.string().regex(AI_CHAT_SESSION_ID_REGEX),
});

export function registerAiAssistantRoutes({ app, db, config, documentSearchServices }: RouteDefinitionContext) {
  const aiAssistantRepository = createAiAssistantRepository({ db });

  app.post(
    '/api/organizations/:organizationId/ai/chat',
    requireAuthentication(),
    requireFeatureFlag({ flagId: 'llc_finances', db }),
    legacyValidateParams(z.object({ organizationId: organizationIdSchema })),
    legacyValidateJsonBody(chatBodySchema),
    async (context) => {
      const { userId } = getUser({ context });
      const { organizationId } = context.req.valid('param');
      const { messages, model: modelOverride, sessionId } = context.req.valid('json');

      const organizationsRepository = createOrganizationsRepository({ db });
      await ensureUserIsInOrganization({ userId, organizationId, organizationsRepository });

      const aiConfig = config.aiAssistant as { openaiApiKey: string | undefined; anthropicApiKey: string | undefined; model: string | undefined };
      const configuredProviders = getConfiguredProviders({ openaiApiKey: aiConfig.openaiApiKey, anthropicApiKey: aiConfig.anthropicApiKey });

      if (configuredProviders.length === 0) {
        throw createAiNotConfiguredError();
      }

      const selectedModel = modelOverride !== undefined && modelOverride !== ''
        ? AVAILABLE_MODELS.find(m => m.id === modelOverride)
        : undefined;

      const provider = selectedModel?.provider ?? configuredProviders[0]!;
      const apiKey = provider === 'anthropic' ? aiConfig.anthropicApiKey : aiConfig.openaiApiKey;

      if (apiKey === undefined || apiKey === '') {
        throw createAiNotConfiguredError();
      }

      const model = createLlmModel({
        provider,
        apiKey,
        model: selectedModel?.id ?? aiConfig.model,
      });

      const tools = createAssistantTools({
        db,
        organizationId,
        authSecret: config.auth.secret,
        documentSearchServices,
      });

      // Create or reuse chat session
      let activeSessionId = sessionId;
      if (activeSessionId === undefined || activeSessionId === '') {
        const lastUserMessage = messages.findLast(m => m.role === 'user');
        const title = lastUserMessage
          ? lastUserMessage.content.trim().slice(0, 50) + (lastUserMessage.content.length > 50 ? '...' : '')
          : 'New chat';

        const { session } = await aiAssistantRepository.createChatSession({
          organizationId,
          userId,
          title,
          model: selectedModel?.id ?? aiConfig.model,
        });
        activeSessionId = session.id;

        // Save all initial messages
        await aiAssistantRepository.addChatMessages({
          sessionId: activeSessionId,
          messages: messages.map(m => ({ role: m.role, content: m.content })),
        });
      } else {
        // Save only the last user message (previous messages already stored)
        const lastUserMessage = messages.findLast(m => m.role === 'user');
        if (lastUserMessage) {
          await aiAssistantRepository.addChatMessage({
            sessionId: activeSessionId,
            role: lastUserMessage.role,
            content: lastUserMessage.content,
          });

          // Update title if this is the first user message
          const { messages: existingMessages } = await aiAssistantRepository.getChatMessages({ sessionId: activeSessionId });
          const userMessages = existingMessages.filter(m => m.role === 'user');
          if (userMessages.length === 1) {
            const title = lastUserMessage.content.trim().slice(0, 50) + (lastUserMessage.content.length > 50 ? '...' : '');
            await aiAssistantRepository.updateChatSessionTitle({ sessionId: activeSessionId, userId, title });
          }
        }
      }

      // Sliding window: keep only the last N messages to control context size and costs
      const MAX_CONTEXT_MESSAGES = 20;
      const contextMessages = messages.length > MAX_CONTEXT_MESSAGES
        ? messages.slice(-MAX_CONTEXT_MESSAGES)
        : messages;

      const result = streamText({
        model,
        system: SYSTEM_PROMPT,
        messages: contextMessages,
        tools,
        stopWhen: stepCountIs(10),
        onFinish: async ({ text }) => {
          if (activeSessionId && text) {
            await aiAssistantRepository.addChatMessage({
              sessionId: activeSessionId,
              role: 'assistant',
              content: text,
            });
          }
        },
      });

      // Return sessionId in a custom header so the client can track it
      const response = result.toTextStreamResponse();
      response.headers.set('X-Session-Id', activeSessionId);
      return response;
    },
  );

  // List chat sessions
  app.get(
    '/api/organizations/:organizationId/ai/sessions',
    requireAuthentication(),
    legacyValidateParams(z.object({ organizationId: organizationIdSchema })),
    async (context) => {
      const { userId } = getUser({ context });
      const { organizationId } = context.req.valid('param');

      const organizationsRepository = createOrganizationsRepository({ db });
      await ensureUserIsInOrganization({ userId, organizationId, organizationsRepository });

      const { sessions } = await aiAssistantRepository.getChatSessions({ organizationId, userId });

      return context.json({ sessions });
    },
  );

  // Get session with messages
  app.get(
    '/api/organizations/:organizationId/ai/sessions/:sessionId',
    requireAuthentication(),
    legacyValidateParams(sessionIdParamSchema),
    async (context) => {
      const { userId } = getUser({ context });
      const { organizationId, sessionId } = context.req.valid('param');

      const organizationsRepository = createOrganizationsRepository({ db });
      await ensureUserIsInOrganization({ userId, organizationId, organizationsRepository });

      const { session } = await aiAssistantRepository.getChatSessionById({ sessionId, userId });
      if (!session) {
        return context.json({ error: 'Session not found' }, 404);
      }

      const { messages } = await aiAssistantRepository.getChatMessages({ sessionId });

      return context.json({
        session,
        messages: messages.map(m => ({ role: m.role, content: m.content })),
      });
    },
  );

  // Delete session
  app.delete(
    '/api/organizations/:organizationId/ai/sessions/:sessionId',
    requireAuthentication(),
    legacyValidateParams(sessionIdParamSchema),
    async (context) => {
      const { userId } = getUser({ context });
      const { organizationId, sessionId } = context.req.valid('param');

      const organizationsRepository = createOrganizationsRepository({ db });
      await ensureUserIsInOrganization({ userId, organizationId, organizationsRepository });

      await aiAssistantRepository.deleteChatSession({ sessionId, userId });

      return context.json({ success: true });
    },
  );

  app.get(
    '/api/ai/models',
    requireAuthentication(),
    (context) => {
      const aiConfig = config.aiAssistant as { openaiApiKey: string | undefined; anthropicApiKey: string | undefined; model: string | undefined };
      const configuredProviders = getConfiguredProviders({ openaiApiKey: aiConfig.openaiApiKey, anthropicApiKey: aiConfig.anthropicApiKey });
      const isConfigured = configuredProviders.length > 0;
      const defaultModel = aiConfig.model ?? getDefaultModel({ configuredProviders });
      const availableModels = AVAILABLE_MODELS.filter(m => configuredProviders.includes(m.provider));

      return context.json({
        isConfigured,
        defaultModel,
        providers: configuredProviders,
        models: availableModels.map(m => ({ id: m.id, label: m.label, provider: m.provider })),
      });
    },
  );
}
