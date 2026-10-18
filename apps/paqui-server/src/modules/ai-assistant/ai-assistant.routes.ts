import type { ModelMessage } from 'ai';
import type { RouteDefinitionContext } from '../app/server.types';
import { stepCountIs, streamText } from 'ai';
import { z } from 'zod';
import { AI_FEATURES } from '../ai-usage/ai-usage.constants';
import { requireAuthentication } from '../app/auth/auth.middleware';
import { getUser } from '../app/auth/auth.models';
import { organizationIdSchema } from '../organizations/organization.schemas.legacy';
import { createOrganizationsRepository } from '../organizations/organizations.repository';
import { ensureUserIsInOrganization } from '../organizations/organizations.usecases';
import { legacyValidateJsonBody, legacyValidateParams } from '../shared/validation/validation.legacy';
import { getAssistantCapabilities } from './ai-assistant.capabilities.usecases';
import { AI_CHAT_SESSION_ID_REGEX } from './ai-assistant.constants';
import { createAiNotConfiguredError } from './ai-assistant.errors';
import { AI_MODELS, AI_PROVIDER_LABELS } from './ai-assistant.models';
import { buildSystemPrompt } from './ai-assistant.prompt';
import { getAiModel, getAiModelSelection, isAiConfigured } from './ai-assistant.providers';
import { createAiAssistantRepository } from './ai-assistant.repository';
import { MAX_CHAT_ATTACHMENTS } from './attachments/attachments.constants';
import { toChatAttachment } from './attachments/attachments.models';
import { registerAiAttachmentsRoutes } from './attachments/attachments.routes';
import { buildModelMessages, getOrganizationDocuments, getTitleFromMessage } from './attachments/attachments.usecases';
import { pageContextSchema } from './page-context/page-context.schemas';
import { CONFIRMABLE_TOOL_SCHEMAS, createAssistantToolset } from './tools/assistant-toolset';

const chatBodySchema = z.object({
  messages: z.array(z.object({
    role: z.enum(['user', 'assistant', 'system']),
    content: z.string(),
    // Documents of the organization attached to the message (uploaded first)
    attachments: z.array(z.object({ documentId: z.string().min(1).max(64) })).max(MAX_CHAT_ATTACHMENTS).optional(),
  })),
  sessionId: z.string().optional(),
  pageContext: pageContextSchema.optional(),
});

const sessionIdParamSchema = z.object({
  organizationId: organizationIdSchema,
  sessionId: z.string().regex(AI_CHAT_SESSION_ID_REGEX),
});

export function registerAiAssistantRoutes(routeContext: RouteDefinitionContext) {
  const { app, db, config, documentSearchServices, documentsStorageService } = routeContext;
  const aiAssistantRepository = createAiAssistantRepository({ db });

  registerAiAttachmentsRoutes(routeContext);

  app.post(
    '/api/organizations/:organizationId/ai/chat',
    requireAuthentication(),
    legacyValidateParams(z.object({ organizationId: organizationIdSchema })),
    legacyValidateJsonBody(chatBodySchema),
    async (context) => {
      const { userId } = getUser({ context });
      const { organizationId } = context.req.valid('param');
      const { messages, sessionId, pageContext } = context.req.valid('json');

      const organizationsRepository = createOrganizationsRepository({ db });
      await ensureUserIsInOrganization({ userId, organizationId, organizationsRepository });

      if (!isAiConfigured({ config })) {
        throw createAiNotConfiguredError();
      }

      // Always the model chosen in the admin panel (or the default one): members never pick it
      const selection = await getAiModelSelection({ config, db });
      const resolvedModelId = selection.model;
      const modelLabel = AI_MODELS.find(m => m.id === resolvedModelId)?.label ?? resolvedModelId;
      const providerLabel = AI_PROVIDER_LABELS[selection.provider];

      const model = getAiModel({ config, db, feature: AI_FEATURES.ASSISTANT_CHAT, organizationId, userId });
      const { profile: userProfile } = await aiAssistantRepository.getUserProfile({ userId });
      const capabilities = await getAssistantCapabilities({ userId, db });
      const systemPrompt = buildSystemPrompt({ now: new Date(), providerLabel, modelLabel, profile: userProfile, pageContext, organizationId, capabilities });

      const { tools } = createAssistantToolset({
        db,
        organizationId,
        userId,
        authSecret: config.auth.secret,
        documentSearchServices,
        tavilyApiKey: (config.aiAssistant as { tavilyApiKey?: string }).tavilyApiKey,
        aiAssistantRepository,
        app,
        requestHeaders: context.req.raw.headers,
        env: context.env,
        pageContext,
        capabilities,
        config,
        documentsStorageService,
      });

      // The attached files must be documents of this organization: unknown ids are dropped
      const { documents: attachedDocuments } = await getOrganizationDocuments({ db, organizationId, documentIds: [...new Set(messages.flatMap(message => message.attachments ?? []).map(({ documentId }) => documentId))] });
      const getAttachments = (message: (typeof messages)[number]) => (message.attachments ?? [])
        .map(({ documentId }) => attachedDocuments.find(document => document.id === documentId))
        .filter(document => document !== undefined);
      // Kept with the message so the conversation shows its files again when reopened
      const getMessageMetadata = (message: (typeof messages)[number]) => {
        const attachments = getAttachments(message);
        return attachments.length > 0 ? JSON.stringify({ attachments: attachments.map(toChatAttachment) }) : undefined;
      };

      // Create or reuse chat session
      let activeSessionId = sessionId;
      if (activeSessionId !== undefined && activeSessionId !== '') {
        // Ensure the supplied session belongs to this user (and org). Without this
        // check, any authenticated user could write messages into another user's
        // or organization's chat session by passing its id.
        const { session: ownedSession } = await aiAssistantRepository.getChatSessionById({ sessionId: activeSessionId, userId });
        if (!ownedSession || ownedSession.organizationId !== organizationId) {
          return context.json({ error: 'Session not found' }, 404);
        }
      }
      if (activeSessionId === undefined || activeSessionId === '') {
        const lastUserMessage = messages.findLast(m => m.role === 'user');
        const title = lastUserMessage ? getTitleFromMessage({ content: lastUserMessage.content, attachments: getAttachments(lastUserMessage) }) : 'New chat';

        const { session } = await aiAssistantRepository.createChatSession({
          organizationId,
          userId,
          title,
          model: resolvedModelId,
        });
        activeSessionId = session.id;

        // Save all initial messages
        await aiAssistantRepository.addChatMessages({
          sessionId: activeSessionId,
          messages: messages.map(m => ({ role: m.role, content: m.content, metadata: getMessageMetadata(m) })),
        });
      } else {
        // Save only the last user message (previous messages already stored)
        const lastUserMessage = messages.findLast(m => m.role === 'user');
        if (lastUserMessage) {
          await aiAssistantRepository.addChatMessage({
            sessionId: activeSessionId,
            role: lastUserMessage.role,
            content: lastUserMessage.content,
            metadata: getMessageMetadata(lastUserMessage),
          });

          // Update title if this is the first user message
          const { messages: existingMessages } = await aiAssistantRepository.getChatMessages({ sessionId: activeSessionId });
          const userMessages = existingMessages.filter(m => m.role === 'user');
          if (userMessages.length === 1) {
            const title = getTitleFromMessage({ content: lastUserMessage.content, attachments: getAttachments(lastUserMessage) });
            await aiAssistantRepository.updateChatSessionTitle({ sessionId: activeSessionId, userId, title });
          }
        }
      }

      // Sliding window: keep only the last N messages to control context size and costs
      const MAX_CONTEXT_MESSAGES = 20;
      const contextMessages: ModelMessage[] = await buildModelMessages({
        messages: (messages.length > MAX_CONTEXT_MESSAGES ? messages.slice(-MAX_CONTEXT_MESSAGES) : messages)
          .map(message => ({ role: message.role, content: message.content, attachments: getAttachments(message) })),
        documentsStorageService,
        config,
      });

      const collectedSources: Array<{ title: string; url: string }> = [];
      const collectedConfirmations: Array<{ toolCallId: string; toolName: string; description: string; args: Record<string, unknown>; status: 'pending' }> = [];

      const result = streamText({
        model,
        system: systemPrompt,
        messages: contextMessages,
        tools,
        stopWhen: stepCountIs(15),
        onError: ({ error }) => {
          console.error('[AI Chat] streamText onError:', error);
        },
        onFinish: async ({ text }) => {
          if (activeSessionId && text) {
            const hasMeta = collectedSources.length > 0 || collectedConfirmations.length > 0;
            const metadata = hasMeta
              ? JSON.stringify({ webSources: collectedSources, toolConfirmations: collectedConfirmations })
              : undefined;
            await aiAssistantRepository.addChatMessage({
              sessionId: activeSessionId,
              role: 'assistant',
              content: text,
              metadata,
            });
          }
        },
      });

      // Build a combined stream from fullStream: text + reasoning + tool confirmations
      const encoder = new TextEncoder();
      const combinedStream = new ReadableStream({
        async start(controller) {
          try {
            for await (const part of result.fullStream) {
              if (part.type === 'text-delta') {
                controller.enqueue(encoder.encode(`0:${JSON.stringify(part.text)}\n`));
              } else if (part.type === 'reasoning-delta') {
                controller.enqueue(encoder.encode(`r:${JSON.stringify(part.text)}\n`));
              } else if (part.type === 'tool-call') {
                controller.enqueue(encoder.encode(`t:${JSON.stringify({ toolName: part.toolName })}\n`));
              } else if (part.type === 'tool-result' && 'output' in part) {
                // Signal tool finished
                controller.enqueue(encoder.encode(`d:${JSON.stringify({ toolName: part.toolName })}\n`));
                const toolResult = part.output as Record<string, unknown>;
                // Emit web search sources
                if (part.toolName === 'webSearch' && Array.isArray(toolResult?.results)) {
                  const sources = (toolResult.results as Array<{ title: string; url: string }>)
                    .map(r => ({ title: r.title, url: r.url }));
                  if (sources.length > 0) {
                    collectedSources.push(...sources);
                    controller.enqueue(encoder.encode(`s:${JSON.stringify(sources)}\n`));
                  }
                }
                if (part.toolName === 'navigateToPage' && toolResult?.navigation !== undefined) {
                  controller.enqueue(encoder.encode(`n:${JSON.stringify(toolResult.navigation)}\n`));
                }
                if (toolResult.requiresConfirmation === true) {
                  const conf = {
                    toolCallId: part.toolCallId,
                    toolName: toolResult.toolName as string,
                    description: toolResult.description as string,
                    args: toolResult.args as Record<string, unknown>,
                    status: 'pending' as const,
                  };
                  collectedConfirmations.push(conf);
                  controller.enqueue(encoder.encode(`a:${JSON.stringify(conf)}\n`));
                }
              }
            }
          } catch (streamError) {
            console.error('[AI Chat] fullStream error:', streamError);
          } finally {
            controller.close();
          }
        },
      });

      return new Response(combinedStream, {
        headers: {
          'Content-Type': 'text/plain; charset=utf-8',
          'X-Session-Id': activeSessionId,
        },
      });
    },
  );

  // Execute a confirmed tool action
  app.post(
    '/api/organizations/:organizationId/ai/tools/execute',
    requireAuthentication(),
    legacyValidateParams(z.object({ organizationId: organizationIdSchema })),
    legacyValidateJsonBody(z.object({
      toolName: z.string(),
      args: z.record(z.unknown()),
    })),
    async (context) => {
      const { userId } = getUser({ context });
      const { organizationId } = context.req.valid('param');
      const { toolName, args } = context.req.valid('json');

      const organizationsRepository = createOrganizationsRepository({ db });
      await ensureUserIsInOrganization({ userId, organizationId, organizationsRepository });

      const schema = CONFIRMABLE_TOOL_SCHEMAS[toolName];
      if (!schema) {
        return context.json({ error: 'Unknown or non-confirmable tool' }, 400);
      }

      const validatedArgs: unknown = schema.parse(args);

      const { executors } = createAssistantToolset({
        db,
        organizationId,
        userId,
        authSecret: config.auth.secret,
        documentSearchServices,
        aiAssistantRepository,
        app,
        requestHeaders: context.req.raw.headers,
        env: context.env,
        pageContext: undefined,
        config,
        documentsStorageService,
        capabilities: await getAssistantCapabilities({ userId, db }),
      });

      const executor = executors[toolName];
      if (!executor) {
        return context.json({ error: 'Executor not found' }, 400);
      }

      const result: unknown = await executor(validatedArgs);
      return context.json(result);
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

      type MessageMetadata = {
        webSources?: Array<{ title: string; url: string }>;
        toolConfirmations?: Array<{ toolCallId: string; toolName: string; description: string; args: Record<string, unknown>; status: 'pending' | 'approved' | 'rejected'; result?: unknown }>;
      };
      return context.json({
        session,
        messages: messages.map((m) => {
          let metadata: MessageMetadata | undefined;
          if (m.metadata != null) {
            metadata = JSON.parse(m.metadata) as MessageMetadata;
          }
          return { id: m.id, role: m.role, content: m.content, metadata };
        }),
      });
    },
  );

  // Update message metadata (e.g. tool confirmation status)
  app.patch(
    '/api/organizations/:organizationId/ai/sessions/:sessionId/messages/:messageId/metadata',
    requireAuthentication(),
    legacyValidateParams(z.object({ organizationId: z.string(), sessionId: z.string(), messageId: z.string() })),
    legacyValidateJsonBody(z.object({ metadata: z.string() })),
    async (context) => {
      const { userId } = getUser({ context });
      const { organizationId, sessionId, messageId } = context.req.valid('param');
      const { metadata } = context.req.valid('json');

      const organizationsRepository = createOrganizationsRepository({ db });
      await ensureUserIsInOrganization({ userId, organizationId, organizationsRepository });

      const { session } = await aiAssistantRepository.getChatSessionById({ sessionId, userId });
      if (!session) {
        return context.json({ error: 'Session not found' }, 404);
      }

      await aiAssistantRepository.updateChatMessageMetadata({ messageId, metadata });

      return context.json({ success: true });
    },
  );

  // Rename session
  app.patch(
    '/api/organizations/:organizationId/ai/sessions/:sessionId',
    requireAuthentication(),
    legacyValidateParams(sessionIdParamSchema),
    legacyValidateJsonBody(z.object({ title: z.string().min(1).max(100) })),
    async (context) => {
      const { userId } = getUser({ context });
      const { organizationId, sessionId } = context.req.valid('param');
      const { title } = context.req.valid('json');

      const organizationsRepository = createOrganizationsRepository({ db });
      await ensureUserIsInOrganization({ userId, organizationId, organizationsRepository });

      await aiAssistantRepository.updateChatSessionTitle({ sessionId, userId, title });

      return context.json({ success: true });
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

  // Get user AI profile
  app.get(
    '/api/ai/profile',
    requireAuthentication(),
    async (context) => {
      const { userId } = getUser({ context });
      const { profile } = await aiAssistantRepository.getUserProfile({ userId });
      return context.json({ profile });
    },
  );

  // Update user AI profile (add/update entries)
  app.patch(
    '/api/ai/profile',
    requireAuthentication(),
    legacyValidateJsonBody(z.object({
      entries: z.record(z.string(), z.string()),
    })),
    async (context) => {
      const { userId } = getUser({ context });
      const { entries } = context.req.valid('json');
      const { profile } = await aiAssistantRepository.upsertUserProfile({ userId, entries });
      return context.json({ profile });
    },
  );

  // Delete a key from user AI profile
  app.delete(
    '/api/ai/profile/:key',
    requireAuthentication(),
    legacyValidateParams(z.object({ key: z.string() })),
    async (context) => {
      const { userId } = getUser({ context });
      const { key } = context.req.valid('param');
      const { profile } = await aiAssistantRepository.deleteUserProfileKey({ userId, key });
      return context.json({ profile });
    },
  );
}
