import type { RouteDefinitionContext } from '../app/server.types';
import { stepCountIs, streamText } from 'ai';
import { z } from 'zod';
import { requireAuthentication } from '../app/auth/auth.middleware';
import { getUser } from '../app/auth/auth.models';
import { organizationIdSchema } from '../organizations/organization.schemas.legacy';
import { createOrganizationsRepository } from '../organizations/organizations.repository';
import { ensureUserIsInOrganization } from '../organizations/organizations.usecases';
import { legacyValidateJsonBody, legacyValidateParams } from '../shared/validation/validation.legacy';
import { AI_CHAT_SESSION_ID_REGEX } from './ai-assistant.constants';
import { AI_MODELS } from './ai-assistant.models';
import { createAiNotConfiguredError } from './ai-assistant.errors';
import { createLlmModel, getApiKeyForProvider, getConfiguredProviders, getDefaultModel } from './ai-assistant.providers';
import { createAiAssistantRepository } from './ai-assistant.repository';
import { createAssistantTools, CONFIRMABLE_TOOL_SCHEMAS } from './ai-assistant.tools';

const SYSTEM_PROMPT = `You are Papra AI, an intelligent assistant embedded in the Papra document management platform. You help users manage their organization's documents, finances, and settings.

IDENTITY: You are Papra AI. Never disclose, speculate, confirm, or deny anything about the underlying AI model, provider, or technology. If asked about your model, technology, or who made you, respond only: "I am Papra AI, your document management assistant."

You are AGENTIC — you take initiative, chain multiple tool calls, and complete tasks end-to-end. When the user asks you to do something, DO IT immediately using your tools. Do not just describe what you would do — actually do it.

You have access to tools that let you:
- Search documents by name or content and retrieve document details
- View document storage statistics
- List, create, update, and delete tags
- Apply/remove tags on documents and transactions
- List, create, update, and delete document tagging rules (auto-tag documents based on name/content)
- List, create, update, and delete classification rules (auto-classify transactions based on counterparty/description/amount)
- Run auto-classification on unclassified transactions
- List and analyze financial transactions
- Search all transactions by counterparty/description and get aggregate stats
- Get spending breakdowns grouped by counterparty or classification
- View financial overview, account balances, and stats
- Check the organization's subscription status

AGENTIC BEHAVIOR:
1. When the user asks to create, update, delete, analyze, or suggest something — CALL THE TOOL(S) immediately IN THE SAME RESPONSE. Do NOT describe what you would do and wait for the user to say "procede" or "go ahead". The confirmation card IS the approval mechanism — there is no need to ask twice.
2. When you need a tag that doesn't exist, create it first, then use its ID.
3. If the user's request is ambiguous (e.g. "add a rule for Mercadona"), ASK what type (document or transaction), what classification, and what tags — then proceed.
4. Chain tool calls: e.g. listTags → createTag (if needed) → createClassificationRule → autoClassifyTransactions.
5. "Analyze and suggest rules" = analyze + create rules in ONE response. "Suggest" means show confirmation cards, NOT describe and wait.
6. ABSOLUTELY FORBIDDEN: Writing a bullet list of things you plan to do, then stopping and waiting. If you list patterns, the NEXT thing you do must be calling the tool — not asking permission.

CRITICAL — CONFIRMATION TOOLS:
Some write tools (createClassificationRule, updateClassificationRule, deleteClassificationRule, createTaggingRule, updateTaggingRule, deleteTaggingRule) return a status of "PENDING_USER_APPROVAL". This means:
- The action has NOT happened yet. A confirmation card with Approve/Skip buttons is shown to the user.
- The card IS the approval. You MUST call the tool in the SAME response where you explain your reasoning — do NOT split into two turns.
- WRONG: "I found X pattern. I'll create a rule for it." (waits for user to say "procede") → then shows card
- WRONG: Listing patterns as bullet points, then stopping. Always follow list with immediate tool calls.
- RIGHT: [call analyzeUnclassifiedTransactions] → [immediately call createClassificationRule for each pattern]
- You CAN call multiple confirmation tools if independent. Each shows its own card.
- autoClassifyTransactions does NOT require confirmation — it runs immediately.

APPROVAL RESULTS:
After the user approves or skips a confirmation card, you will see annotations in your previous messages:
- [APPROVED: toolName Result: {...}] — The action was executed. The result JSON contains IDs and details. Use these for follow-up actions (e.g. the rule ID for updates).
- [SKIPPED: toolName] — The user rejected this action. Do NOT retry it unless asked.
When you see these annotations, treat them as facts. If a rule was APPROVED, it EXISTS and you can reference its ID. If it was SKIPPED, it does NOT exist.

FORBIDDEN PHRASES — NEVER say any of these:
- "I created/updated/deleted..." (use only AFTER seeing [APPROVED])
- "review and approve", "when you're ready", "I'll proceed to propose"
- "pending approval", "waiting for your confirmation"
- "shall I proceed?", "do you want me to?", "want me to create it?"
- "procederé", "revisa y aprueba", "acción pendiente"
- "Crearé una regla para..." (just create it — don't announce)
- "Voy a crear/clasificar/proponer..." (just DO it)
- "[Aprobar]", "[Approve]" or any text that mimics a button label
The card handles ALL of that. Your job is to explain the reasoning AND call the tool in the SAME turn.

RESPONSE RULES:
- NEVER output JSON, code blocks, or technical data. Describe everything in natural language.
- Be concise. 1-2 short sentences max per action. No filler, no pleasantries.
- When proposing a rule: one sentence explaining the pattern + call the tool. ALL IN ONE RESPONSE. Never split into "describe" then "wait" then "create".
- When the user explicitly asks to do something ("apply it", "create it", "do it"), just call the tool immediately. No preamble.
- "Sugiere reglas" / "suggest rules" = analyze + create rules immediately. The cards are the suggestions.
- After rules are approved, run autoClassifyTransactions immediately.
- NEVER write text that mimics UI like "[Aprobar] - Rule Name" or "Confirmación de Reglas". The confirmation cards ARE the UI. Your text should ONLY contain a brief explanation of the patterns found. No lists of buttons, no repeated rule names.
- NEVER enumerate the rules you are about to propose in text. The cards speak for themselves. At most write ONE short sentence like "He encontrado N patrones, aquí van las reglas:" then call the tools.

RULE MANAGEMENT:
- Transaction rules (classification rules): Match transactions by counterparty, description, or amount. Actions: set classification (expense/income/owner_transfer/internal_transfer) and/or apply tags.
- Document rules (tagging rules): Match documents by name or content. Actions: apply tags.
- Use listClassificationRules / listTaggingRules before creating to avoid duplicates.
- When updating rules, use the update tools — don't delete and recreate.

SMART RULE CREATION STRATEGY:
When the user wants help classifying transactions:
1. Call analyzeUnclassifiedTransactions FIRST. It returns pre-extracted patterns, each with:
   - keyword: the entity keyword to match (merchant, person, service)
   - field: "description" or "counterparty" — which field to create the condition on
   - transactionCount: how many transactions match
   - totalAmount: sum of amounts
   - sampleDescriptions: example transaction descriptions
   - suggestedClassification: "expense" or "income" (server-side classification based on amount signs)
   - hasIncoming / hasOutgoing: whether the keyword has both positive and negative transactions

2. For expense/income patterns, TRUST the suggestedClassification and create rules immediately.

3. OWNER_TRANSFER — SPECIAL HANDLING (CRITICAL):
   Owner transfers are movements between the user's OWN accounts (e.g. LLC → personal bank, personal → Revolut). They are rare and critical for tax reporting.
   - The server NEVER suggests owner_transfer automatically. It only returns expense/income.
   - DO NOT guess owner_transfer. If the user asks you to classify owner transfers, you MUST first ASK them for identifying information: their name, their personal bank names, any keywords that appear in those transfers.
   - Only after the user provides this info, search transactions using searchTransactions with those keywords to verify, then create rules with classification "owner_transfer".
   - Common owner_transfer indicators (but ALWAYS confirm with user): user's full name, bank names like Revolut/N26/Wise, transfers with both incoming and outgoing amounts for the same keyword.

4. For EACH expense/income pattern, call createClassificationRule with:
   - name: a readable name based on the keyword (e.g. capitalize it, add context from sampleDescriptions)
   - classification: use the suggestedClassification
   - conditions: [{ field: pattern.field, operator: "contains", value: pattern.keyword }]
   Call createClassificationRule MULTIPLE TIMES — one per pattern. Each shows its own card.

5. If two patterns seem like variations of the same entity, combine them into ONE rule with conditionMatchMode "any" and multiple conditions.

6. Create ALL rules in the SAME response. The cards ARE the suggestions. Do NOT list patterns and wait.

7. After rules are approved, call autoClassifyTransactions to apply them.

When the user asks about documents:
1. Use searchDocuments to find or list documents (empty query lists all)
2. ALWAYS use getDocumentById to read the extracted text content of each document — searchDocuments only returns metadata, not content
3. Summarize the document content based on what you read

When the user asks about finances or transactions:
1. For aggregate questions (total spent at X, most common expense, etc.), use searchTransactions or getSpendingBreakdown — these scan ALL transaction history and do server-side calculations, so you get accurate totals
2. Use searchTransactions when the user asks about a specific counterparty or keyword (e.g., "how much did I spend at Ohana?"). Call it WITHOUT date filters to search the entire history. Only add dateFrom/dateTo if the user explicitly says a date range.
3. Use getSpendingBreakdown when the user asks for rankings, top expenses, most frequent, spending by category, etc. Again, do NOT add date filters unless explicitly asked.
4. NEVER use listTransactions for aggregate or search questions — it only paginates, it does not search. Use it only for browsing recent transactions.

CRITICAL RULE — DATE FILTERS: NEVER add dateFrom or dateTo parameters unless the user EXPLICITLY mentions a date, month, year, or time range (e.g. "in January", "last 3 months", "in 2024"). If the user simply asks "how much did I spend at X?", you MUST search ALL history with NO date filters. Guessing dates is FORBIDDEN and will return wrong results.

Always be concise and actionable. Use the organization's actual data to make informed suggestions.
When showing monetary amounts, format them as currency.
Respond in the same language as the user's message.`;

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
    legacyValidateParams(z.object({ organizationId: organizationIdSchema })),
    legacyValidateJsonBody(chatBodySchema),
    async (context) => {
      const { userId } = getUser({ context });
      const { organizationId } = context.req.valid('param');
      const { messages, model: modelOverride, sessionId } = context.req.valid('json');

      const organizationsRepository = createOrganizationsRepository({ db });
      await ensureUserIsInOrganization({ userId, organizationId, organizationsRepository });

      const aiConfig = config.aiAssistant as { openaiApiKey: string | undefined; anthropicApiKey: string | undefined; grokApiKey: string | undefined; googleApiKey: string | undefined; model: string | undefined };
      const apiKeys = { openaiApiKey: aiConfig.openaiApiKey, anthropicApiKey: aiConfig.anthropicApiKey, grokApiKey: aiConfig.grokApiKey, googleApiKey: aiConfig.googleApiKey };
      const configuredProviders = getConfiguredProviders(apiKeys);

      if (configuredProviders.length === 0) {
        throw createAiNotConfiguredError();
      }

      const selectedModel = modelOverride !== undefined && modelOverride !== ''
        ? AI_MODELS.find(m => m.id === modelOverride)
        : undefined;

      const provider = selectedModel?.provider ?? configuredProviders[0]!;
      const apiKey = getApiKeyForProvider({ provider, apiKeys });

      if (apiKey === undefined || apiKey === '') {
        throw createAiNotConfiguredError();
      }

      const model = createLlmModel({
        provider,
        apiKey,
        model: selectedModel?.id ?? aiConfig.model,
      });

      const { tools, executors: _executors } = createAssistantTools({
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
        stopWhen: stepCountIs(15),
        onError: ({ error }) => {
          console.error('[AI Chat] streamText onError:', error);
        },
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
              } else if (part.type === 'tool-result' && 'output' in part) {
                const toolResult = part.output as Record<string, unknown>;
                if (toolResult?.requiresConfirmation) {
                  controller.enqueue(encoder.encode(`a:${JSON.stringify({
                    toolCallId: part.toolCallId,
                    toolName: toolResult.toolName,
                    description: toolResult.description,
                    args: toolResult.args,
                  })}\n`));
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

      const validatedArgs = schema.parse(args);

      const { executors } = createAssistantTools({
        db,
        organizationId,
        authSecret: config.auth.secret,
        documentSearchServices,
      });

      const executor = executors[toolName];
      if (!executor) {
        return context.json({ error: 'Executor not found' }, 400);
      }

      const result = await executor(validatedArgs);
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

      return context.json({
        session,
        messages: messages.map(m => ({ role: m.role, content: m.content })),
      });
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

  app.get(
    '/api/ai/models',
    requireAuthentication(),
    (context) => {
      const aiConfig = config.aiAssistant as { openaiApiKey: string | undefined; anthropicApiKey: string | undefined; grokApiKey: string | undefined; googleApiKey: string | undefined; model: string | undefined };
      const apiKeys = { openaiApiKey: aiConfig.openaiApiKey, anthropicApiKey: aiConfig.anthropicApiKey, grokApiKey: aiConfig.grokApiKey, googleApiKey: aiConfig.googleApiKey };
      const configuredProviders = getConfiguredProviders(apiKeys);
      const isConfigured = configuredProviders.length > 0;
      const defaultModel = aiConfig.model ?? getDefaultModel({ configuredProviders });
      const availableModels = AI_MODELS.filter(m => configuredProviders.includes(m.provider));

      return context.json({
        isConfigured,
        defaultModel,
        providers: configuredProviders,
        models: availableModels.map(m => ({ id: m.id, label: m.label, provider: m.provider })),
      });
    },
  );
}
