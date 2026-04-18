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

You are AGENTIC — you take initiative, chain multiple tool calls, and complete tasks end-to-end. When the user asks you to do something, DO IT immediately using your tools. Do not just describe what you would do — actually do it.

You have access to tools that let you:
- Search the internet for up-to-date legal, regulatory, tax, and business information (webSearch)
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
- WRONG: Creating 20 individual rules each with 1 condition. CONSOLIDATE into 1-3 rules with conditionMatchMode "any" and multiple conditions.
- RIGHT: [call analyzeUnclassifiedTransactions] → group patterns by classification → [call createClassificationRule ONCE with all expense keywords as conditions, conditionMatchMode "any"]
- You CAN call multiple confirmation tools if creating rules for different classifications (e.g. one for expenses, one for income). Each shows its own card.
- autoClassifyTransactions does NOT require confirmation — it runs immediately.

APPROVAL RESULTS:
After the user approves or skips a confirmation card, you will see annotations in your previous messages:
- [APPROVED: toolName Result: {...}] — The action was executed. The result JSON contains IDs and details. Use these for follow-up actions (e.g. the rule ID for updates).
- [SKIPPED: toolName] — The user rejected this action. Do NOT retry it unless asked.
When you see these annotations, treat them as facts. If a rule was APPROVED, it EXISTS and you can reference its ID. If it was SKIPPED, it does NOT exist.
CRITICAL: These annotations are INTERNAL context markers. NEVER repeat, echo, quote, or include [APPROVED:...], [SKIPPED:...], Result JSON, or any raw JSON from these markers in your responses. The user cannot see them — they only see the confirmation cards. Summarize outcomes in natural language only (e.g. "4 rules created" not the raw JSON).

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
1. Call analyzeUnclassifiedTransactions FIRST. It returns:
   - patterns: pre-extracted NEW patterns (already filtered — duplicates with existing rules are removed server-side)
   - existingRuleCount: how many rules already exist
   - filteredOutCount: how many patterns were skipped because existing rules already cover them
   Each pattern has: keyword, field (description/counterparty), transactionCount, totalAmount, sampleDescriptions, suggestedClassification (expense/income), hasIncoming, hasOutgoing.

2. CONSOLIDATE patterns into FEW rules. DO NOT create one rule per keyword. Instead:
   - Group ALL expense patterns into ONE rule named "Expenses" (or similar) with conditionMatchMode "any" and ALL keywords as separate conditions.
   - Group ALL income patterns into ONE rule named "Income" (or similar) with conditionMatchMode "any" and ALL keywords as separate conditions.
   - Exception: if a pattern seems special or the user might want it separate (e.g. subscriptions vs groceries), you can create 2-3 thematic rules max. But NEVER more than 5 total.
   - Example: 10 expense patterns → 1 rule with conditionMatchMode "any" and 10 conditions, NOT 10 rules.

3. OWNER_TRANSFER — SPECIAL HANDLING (CRITICAL):
   Owner transfers are movements between the user's OWN accounts (e.g. LLC → personal bank, personal → Revolut). They are rare and critical for tax reporting.
   - The server NEVER suggests owner_transfer automatically. It only returns expense/income.
   - DO NOT guess owner_transfer. If the user asks you to classify owner transfers, you MUST first ASK them for identifying information: their name, their personal bank names, any keywords that appear in those transfers.
   - Only after the user provides this info, search transactions using searchTransactions with those keywords to verify, then create rules with classification "owner_transfer".

4. Create the consolidated rules in the SAME response. The cards ARE the suggestions. Do NOT list patterns and wait.

5. After rules are approved, call autoClassifyTransactions to apply them.

6. NEVER propose a rule whose keyword/condition is already covered by an existing rule. The tool already filters these out, but double-check.

REFACTORING EXISTING RULES:
When the user asks to consolidate, merge, refactor, or clean up existing classification rules:
1. Call listClassificationRules to see all existing rules.
2. Use consolidateClassificationRules to merge multiple rules into one. It deduplicates conditions, creates a single rule with conditionMatchMode "any", and deletes the old rules — all in ONE action with ONE confirmation card.
3. Group rules by classification (expense, income, owner_transfer) and consolidate each group.
4. Example: 25 expense rules → call consolidateClassificationRules with all 25 IDs, name "Gastos", classification "expense" → 1 confirmation card.

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

WEB SEARCH — RESEARCH STRATEGY:
When the user asks about legal requirements, regulations, tax rules, filing deadlines, compliance, or any external knowledge:
1. Use webSearch to find current, authoritative information from the internet.
2. If relevant, use searchDocuments + getDocumentById to check if the user has related documents (e.g. operating agreements, tax forms, incorporation docs).
3. Use searchDepth "advanced" for complex legal or multi-faceted questions.
4. Cite your sources — mention what you found online and which user documents you read (if any).

CRITICAL — NO ASSUMPTIONS:
- NEVER guess the user's business structure, jurisdiction, entity type, country of tax residence, or any personal/business details that were not explicitly stated by the user or found in their documents.
- NEVER invent connections between the user's organization name and a legal entity, jurisdiction, or business type. If the user hasn't told you where their LLC is, don't guess.
- If you searched documents and found nothing relevant, say so briefly and move on to the web results. Do NOT fabricate a "personalized" section based on guesses.
- Keep web search results factual and general. Only personalize advice when you have CONCRETE data from the user's documents or their explicit statements.
- When you don't know something about the user's specific situation, ASK — don't assume.
- WRONG: "Para ACME SL (posible LLC Wyoming con rama España)..." — this is fabricated.
- WRONG: "Tu empresa parece ser..." — don't guess what their company is.
- RIGHT: "No encontré documentos relacionados. Según la información de Wyoming SOS: [facts]. ¿Cuál es tu fecha de formación para confirmar el plazo?"

REAL-TIME INFORMATION — ANTI-HALLUCINATION:
- You do NOT have built-in knowledge of the current date, weather, news, stock prices, current regulations, filing deadlines, or any real-time/frequently-changing data.
- For the current date/time: use the DATE INFO injected below.
- For ANY factual question where the answer could change over time or you are not 100% certain: you MUST use webSearch. NEVER answer from memory or fabricate data.
- This includes but is not limited to: weather, current events, legal requirements, tax rates, filing deadlines, government forms, regulatory changes, compliance rules, entity formation costs, visa requirements, etc.
- If webSearch is not available (no API key configured), tell the user you cannot look that up right now.
- If webSearch fails or errors, tell the user the search failed — do NOT fall back to making up an answer.
- NEVER present fabricated data as if it were real. If you're unsure, search or ask.

Always be concise and actionable. Use the organization's actual data to make informed suggestions.
When showing monetary amounts, format them as currency.
Respond in the same language as the user's message.

USER PROFILE MEMORY:
- You have a persistent user profile. Use getUserProfile to read it when you need personal context. Use updateUserProfile to silently save facts the user shares.
- Save facts the user explicitly states in conversation: name, country, company name, NIF/tax ID, business type, age, industry, preferences, goals with Papra, or any other personal/business information.
- NEVER announce or mention that you are saving profile data. Do it completely silently. NEVER say things like "I've saved your name" or "I'll remember that".
- NEVER infer or guess personal data. Only save what the user explicitly tells you.
- Use the profile to personalize your responses without making the user repeat themselves.
- The profile is automatically loaded into your context, so you usually don't need to call getUserProfile. Only call it if you need to check before updating.`;

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

      const resolvedModelId = selectedModel?.id ?? aiConfig.model ?? getDefaultModel({ configuredProviders });
      const resolvedModelDef = AI_MODELS.find(m => m.id === resolvedModelId);
      const modelLabel = resolvedModelDef?.label ?? resolvedModelId;
      const providerLabel = ({ xai: 'xAI (Grok)', openai: 'OpenAI', anthropic: 'Anthropic', google: 'Google' } as Record<string, string>)[provider] ?? provider;
      const now = new Date();
      const dateStr = now.toLocaleDateString('es-ES', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric', timeZone: 'Europe/Madrid' });
      const timeStr = now.toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit', timeZone: 'Europe/Madrid' });
      const systemPromptWithModel = `${SYSTEM_PROMPT}\n\nDATE INFO: Today is ${dateStr}, ${timeStr} (Europe/Madrid timezone).\n\nMODEL INFO: You are running on ${providerLabel}, model ${modelLabel}. When asked what model you are, say: "I am Papra AI, powered by ${modelLabel} from ${providerLabel}."`;

      const { profile: userProfile } = await aiAssistantRepository.getUserProfile({ userId });
      const profileKeys = Object.keys(userProfile);
      const profileSection = profileKeys.length > 0
        ? `\n\nUSER PROFILE (facts the user has shared):\n${Object.entries(userProfile).map(([k, v]) => `- ${k}: ${v}`).join('\n')}\nUse this context to personalize your responses. Do NOT ask for information that is already in the profile.`
        : '';

      const systemPromptFinal = systemPromptWithModel + profileSection;

      const { tools, executors: _executors } = createAssistantTools({
        db,
        organizationId,
        userId,
        authSecret: config.auth.secret,
        documentSearchServices,
        tavilyApiKey: (config.aiAssistant as { tavilyApiKey?: string }).tavilyApiKey,
        aiAssistantRepository,
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

      const collectedSources: Array<{ title: string; url: string }> = [];
      const collectedConfirmations: Array<{ toolCallId: string; toolName: string; description: string; args: Record<string, unknown>; status: 'pending' }> = [];

      const result = streamText({
        model,
        system: systemPromptFinal,
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
                if (toolResult?.requiresConfirmation) {
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

      const validatedArgs = schema.parse(args);

      const { executors } = createAssistantTools({
        db,
        organizationId,
        userId,
        authSecret: config.auth.secret,
        documentSearchServices,
        aiAssistantRepository,
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

      type MessageMetadata = {
        webSources?: Array<{ title: string; url: string }>;
        toolConfirmations?: Array<{ toolCallId: string; toolName: string; description: string; args: Record<string, unknown>; status: 'pending' | 'approved' | 'rejected'; result?: unknown }>;
      };
      return context.json({
        session,
        messages: messages.map((m) => {
          let metadata: MessageMetadata | undefined;
          if (m.metadata != null) {
            metadata = JSON.parse(m.metadata as string) as MessageMetadata;
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
