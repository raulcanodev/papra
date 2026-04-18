import type { Database } from '../app/database/database.types';
import type { DocumentSearchServices } from '../documents/document-search/document-search.types';
import type { FinancesRepository } from '../finances/finances.repository';
import { tool, zodSchema } from 'ai';
import { z } from 'zod';
import { searchOrganizationDocuments } from '../documents/document-search/document-search.usecase';
import { createDocumentsRepository } from '../documents/documents.repository';
import { createFinancesRepository } from '../finances/finances.repository';
import { convertCurrency } from '../finances/exchange-rates';
import { autoClassifyTransactions } from '../finances/finances.usecases';
import { createSubscriptionsRepository } from '../subscriptions/subscriptions.repository';
import { createTaggingRulesRepository } from '../tagging-rules/tagging-rules.repository';
import { createTaggingRule as createTaggingRuleUsecase } from '../tagging-rules/tagging-rules.usecases';
import { createTagsRepository } from '../tags/tags.repository';

export const CONFIRMABLE_TOOL_SCHEMAS: Record<string, z.ZodSchema> = {
  createClassificationRule: z.object({
    name: z.string(), classification: z.enum(['expense', 'income', 'owner_transfer', 'internal_transfer']),
    conditions: z.array(z.object({ field: z.string(), operator: z.string(), value: z.string() })),
    conditionMatchMode: z.enum(['all', 'any']).default('all'), tagIds: z.array(z.string()).default([]),
  }),
  updateClassificationRule: z.object({
    ruleId: z.string(), name: z.string().optional(), classification: z.enum(['expense', 'income', 'owner_transfer', 'internal_transfer']).optional(),
    conditions: z.array(z.object({ field: z.string(), operator: z.string(), value: z.string() })).optional(),
    conditionMatchMode: z.enum(['all', 'any']).optional(), tagIds: z.array(z.string()).optional(), isActive: z.boolean().optional(),
  }),
  deleteClassificationRule: z.object({ ruleId: z.string() }),
  consolidateClassificationRules: z.object({
    ruleIds: z.array(z.string()), name: z.string(),
    classification: z.enum(['expense', 'income', 'owner_transfer', 'internal_transfer']),
  }),
  createTaggingRule: z.object({
    name: z.string(), description: z.string().optional(), conditionMatchMode: z.enum(['all', 'any']).default('all'),
    conditions: z.array(z.object({ field: z.string(), operator: z.string(), value: z.string() })),
    tagIds: z.array(z.string()),
  }),
  updateTaggingRule: z.object({
    taggingRuleId: z.string(), name: z.string(), description: z.string().optional(), enabled: z.boolean().optional(),
    conditionMatchMode: z.enum(['all', 'any']).optional(),
    conditions: z.array(z.object({ field: z.string(), operator: z.string(), value: z.string() })),
    tagIds: z.array(z.string()),
  }),
  deleteTaggingRule: z.object({ taggingRuleId: z.string() }),
};

function describeToolAction(toolName: string, args: Record<string, unknown>): string {
  switch (toolName) {
    case 'createClassificationRule': {
      const conds = (args.conditions as Array<{ field: string; operator: string; value: string }>)
        ?.map(c => `${c.field} ${c.operator} "${c.value}"`).join(', ') ?? '';
      return `Create rule "${args.name}": classify as ${args.classification} when ${conds}`;
    }
    case 'updateClassificationRule':
      return `Update classification rule${args.name ? ` "${args.name}"` : ''}`;
    case 'deleteClassificationRule':
      return 'Delete a classification rule (irreversible)';
    case 'consolidateClassificationRules': {
      const count = (args.ruleIds as string[])?.length ?? 0;
      return `Consolidate ${count} rules into "${args.name}" (${args.classification})`;
    }
    case 'createTaggingRule': {
      const conds = (args.conditions as Array<{ field: string; operator: string; value: string }>)
        ?.map(c => `${c.field} ${c.operator} "${c.value}"`).join(', ') ?? '';
      return `Create document rule "${args.name}": auto-tag when ${conds}`;
    }
    case 'updateTaggingRule':
      return `Update document tagging rule${args.name ? ` "${args.name}"` : ''}`;
    case 'deleteTaggingRule':
      return 'Delete a document tagging rule (irreversible)';
    default:
      return `Execute ${toolName}`;
  }
}

function confirmationResult(toolName: string, args: Record<string, unknown>) {
  return {
    requiresConfirmation: true,
    toolName,
    description: describeToolAction(toolName, args),
    args,
    status: 'PENDING_USER_APPROVAL',
    message: 'This action has NOT been executed yet. A confirmation card is now shown to the user. Do NOT say you created/updated/deleted anything — say the action is pending approval. Wait for the user to respond before continuing.',
  };
}

const listTransactionsParams = z.object({
  pageIndex: z.number().int().min(0).default(0).describe('Page index (0-based)'),
  pageSize: z.number().int().min(1).max(100).default(50).describe('Number of transactions per page'),
  classification: z.string().optional().describe('Filter by classification: expense, income, owner_transfer, internal_transfer, or "__unclassified__"'),
});

const createRuleParams = z.object({
  name: z.string().min(1).max(64).describe('Human-readable name for the rule'),
  classification: z.enum(['expense', 'income', 'owner_transfer', 'internal_transfer']),
  conditions: z.array(z.object({
    field: z.enum(['counterparty', 'description', 'amount']),
    operator: z.enum(['contains', 'equals', 'starts_with', 'gt', 'lt']),
    value: z.string().min(1).describe('The value to match against'),
  })).min(1),
  conditionMatchMode: z.enum(['all', 'any']).default('all').describe('Whether all or any conditions must match'),
  tagIds: z.array(z.string()).default([]).describe('Optional array of tag IDs to apply to matching transactions. Use listTags to get available tag IDs.'),
});

const emptyParams = z.object({});

const searchDocumentsParams = z.object({
  searchQuery: z.string().default('').describe('Search query to find documents by name or content. Leave empty to list all documents.'),
  pageIndex: z.number().int().min(0).default(0).describe('Page index (0-based)'),
  pageSize: z.number().int().min(1).max(50).default(20).describe('Number of results per page'),
});

const getDocumentByIdParams = z.object({
  documentId: z.string().min(1).describe('The ID of the document to retrieve'),
});

const applyTagParams = z.object({
  entityType: z.enum(['document', 'transaction']).describe('Whether to apply the tag to a document or transaction'),
  entityId: z.string().min(1).describe('The ID of the document or transaction'),
  tagId: z.string().min(1).describe('The ID of the tag to apply. Use listTags to find available tags.'),
});

const removeTagParams = z.object({
  entityType: z.enum(['document', 'transaction']).describe('Whether to remove the tag from a document or transaction'),
  entityId: z.string().min(1).describe('The ID of the document or transaction'),
  tagId: z.string().min(1).describe('The ID of the tag to remove'),
});

const createTagParams = z.object({
  name: z.string().min(1).max(64).describe('Name for the new tag'),
  color: z.string().optional().describe('Optional hex color (e.g. #ff0000)'),
  description: z.string().optional().describe('Optional description'),
});

const searchTransactionsParams = z.object({
  searchText: z.string().min(1).describe('Text to search for in counterparty name or description. Case-insensitive partial match.'),
  dateFrom: z.string().optional().describe('LEAVE EMPTY unless the user literally says a date range like "in January" or "last month". Never infer or guess dates.'),
  dateTo: z.string().optional().describe('LEAVE EMPTY unless the user literally says a date range like "in January" or "last month". Never infer or guess dates.'),
});

const spendingBreakdownParams = z.object({
  groupBy: z.enum(['counterparty', 'classification']).default('counterparty').describe('Group spending by counterparty or by classification'),
  dateFrom: z.string().optional().describe('Optional start date (ISO 8601)'),
  dateTo: z.string().optional().describe('Optional end date (ISO 8601)'),
  limit: z.number().int().min(1).max(50).default(30).describe('Max number of groups to return'),
});

const updateClassificationRuleParams = z.object({
  ruleId: z.string().min(1).describe('The ID of the classification rule to update. Use listClassificationRules to find rule IDs.'),
  name: z.string().min(1).max(64).optional().describe('New name for the rule'),
  classification: z.enum(['expense', 'income', 'owner_transfer', 'internal_transfer']).optional().describe('New classification'),
  conditions: z.array(z.object({
    field: z.enum(['counterparty', 'description', 'amount']),
    operator: z.enum(['contains', 'equals', 'starts_with', 'gt', 'lt']),
    value: z.string().min(1),
  })).optional().describe('Replace all conditions with this new array'),
  conditionMatchMode: z.enum(['all', 'any']).optional().describe('Whether all or any conditions must match'),
  tagIds: z.array(z.string()).optional().describe('Replace tag IDs. Use listTags to get available tag IDs.'),
  isActive: z.boolean().optional().describe('Enable or disable the rule'),
});

const deleteClassificationRuleParams = z.object({
  ruleId: z.string().min(1).describe('The ID of the classification rule to delete. Use listClassificationRules to find rule IDs.'),
});

const consolidateClassificationRulesParams = z.object({
  ruleIds: z.array(z.string().min(1)).min(2).describe('Array of rule IDs to merge. Use listClassificationRules to get IDs.'),
  name: z.string().min(1).max(64).describe('Name for the new consolidated rule'),
  classification: z.enum(['expense', 'income', 'owner_transfer', 'internal_transfer']).describe('Classification for the consolidated rule'),
});

const createTaggingRuleParams = z.object({
  name: z.string().min(1).max(64).describe('Human-readable name for the document tagging rule'),
  description: z.string().optional().describe('Optional description of what the rule does'),
  conditionMatchMode: z.enum(['all', 'any']).default('all').describe('Whether all or any conditions must match'),
  conditions: z.array(z.object({
    field: z.enum(['name', 'content']).describe('Document field: "name" (document name) or "content" (extracted text)'),
    operator: z.enum(['equal', 'not_equal', 'contains', 'not_contains', 'starts_with', 'ends_with']),
    value: z.string().min(1).describe('The value to match against'),
  })).min(1).describe('At least one condition is required'),
  tagIds: z.array(z.string()).min(1).describe('Tag IDs to apply when conditions match. Use listTags to find IDs, or createTag to make new ones.'),
});

const updateTaggingRuleParams = z.object({
  taggingRuleId: z.string().min(1).describe('The ID of the document tagging rule to update. Use listTaggingRules to find rule IDs.'),
  name: z.string().min(1).max(64).describe('New name for the rule'),
  description: z.string().optional().describe('Optional new description'),
  enabled: z.boolean().optional().describe('Enable or disable the rule'),
  conditionMatchMode: z.enum(['all', 'any']).optional().describe('Whether all or any conditions must match'),
  conditions: z.array(z.object({
    field: z.enum(['name', 'content']),
    operator: z.enum(['equal', 'not_equal', 'contains', 'not_contains', 'starts_with', 'ends_with']),
    value: z.string().min(1),
  })).describe('Full replacement array of conditions'),
  tagIds: z.array(z.string()).min(1).describe('Full replacement array of tag IDs to apply'),
});

const deleteTaggingRuleParams = z.object({
  taggingRuleId: z.string().min(1).describe('The ID of the document tagging rule to delete. Use listTaggingRules to find rule IDs.'),
});

const webSearchParams = z.object({
  query: z.string().min(1).max(400).describe('The search query. Be specific and include relevant context (e.g. "Wyoming LLC annual report filing requirements 2024" instead of just "LLC filing"). For legal/regulatory questions, include the jurisdiction.'),
  searchDepth: z.enum(['basic', 'advanced']).default('basic').describe('Use "advanced" for complex legal, regulatory, or technical questions that need deeper research. Use "basic" for simple factual lookups.'),
  maxResults: z.number().int().min(1).max(10).default(5).describe('Number of results to return. Use 3-5 for most queries, up to 10 for broad research.'),
});

export function createAssistantTools({ db, organizationId, authSecret, documentSearchServices, tavilyApiKey }: {
  db: Database;
  organizationId: string;
  authSecret: string;
  documentSearchServices: DocumentSearchServices;
  tavilyApiKey?: string;
}) {
  const financesRepo = createFinancesRepository({ db, authSecret });
  const tagsRepo = createTagsRepository({ db });
  const documentsRepo = createDocumentsRepository({ db });
  const taggingRulesRepo = createTaggingRulesRepository({ db });
  const subscriptionsRepo = createSubscriptionsRepository({ db });

  // Write tool executors (actual business logic)
  const executors: Record<string, (args: any) => Promise<any>> = {
    createClassificationRule: async (args: z.infer<typeof createRuleParams>) => {
      const { rule } = await financesRepo.createClassificationRule({
        rule: { organizationId, name: args.name, classification: args.classification, conditions: args.conditions, conditionMatchMode: args.conditionMatchMode, tagIds: args.tagIds, priority: 0 },
      });
      return { rule, message: `Classification rule "${args.name}" created successfully.` };
    },
    updateClassificationRule: async (args: z.infer<typeof updateClassificationRuleParams>) => {
      const { ruleId, ...updates } = args;
      const { rule } = await financesRepo.updateClassificationRule({ ruleId, organizationId, updates });
      return { rule, message: `Classification rule "${rule.name}" updated.` };
    },
    deleteClassificationRule: async (args: z.infer<typeof deleteClassificationRuleParams>) => {
      await financesRepo.deleteClassificationRule({ ruleId: args.ruleId, organizationId });
      return { success: true, message: 'Classification rule deleted.' };
    },
    consolidateClassificationRules: async (args: z.infer<typeof consolidateClassificationRulesParams>) => {
      // Fetch all existing rules
      const { rules: allRules } = await financesRepo.getClassificationRules({ organizationId });
      const rulesToMerge = allRules.filter(r => args.ruleIds.includes(r.id));

      if (rulesToMerge.length < 2) {
        return { success: false, message: `Found only ${rulesToMerge.length} of ${args.ruleIds.length} rules. Check the IDs.` };
      }

      // Merge all conditions, deduplicate by field+operator+value
      const seen = new Set<string>();
      const mergedConditions: Array<{ field: string; operator: string; value: string }> = [];
      for (const rule of rulesToMerge) {
        for (const cond of rule.conditions as Array<{ field: string; operator: string; value: string }>) {
          const key = `${cond.field}|${cond.operator}|${cond.value.toLowerCase()}`;
          if (!seen.has(key)) {
            seen.add(key);
            mergedConditions.push(cond);
          }
        }
      }

      // Merge tag IDs
      const mergedTagIds = [...new Set(rulesToMerge.flatMap(r => r.tagIds))];

      // Create the consolidated rule
      const { rule: newRule } = await financesRepo.createClassificationRule({
        rule: {
          organizationId,
          name: args.name,
          classification: args.classification,
          conditions: mergedConditions,
          conditionMatchMode: 'any',
          tagIds: mergedTagIds.length > 0 ? mergedTagIds : undefined,
          priority: 0,
        },
      });

      // Delete old rules
      for (const ruleId of args.ruleIds) {
        await financesRepo.deleteClassificationRule({ ruleId, organizationId });
      }

      return {
        success: true,
        newRule,
        deletedCount: rulesToMerge.length,
        conditionCount: mergedConditions.length,
        message: `Consolidated ${rulesToMerge.length} rules into "${args.name}" with ${mergedConditions.length} conditions.`,
      };
    },
    createTaggingRule: async (args: z.infer<typeof createTaggingRuleParams>) => {
      await createTaggingRuleUsecase({ name: args.name, description: args.description, enabled: true, conditionMatchMode: args.conditionMatchMode, conditions: args.conditions, tagIds: args.tagIds, organizationId, taggingRulesRepository: taggingRulesRepo });
      return { success: true, message: `Document tagging rule "${args.name}" created.` };
    },
    updateTaggingRule: async (args: z.infer<typeof updateTaggingRuleParams>) => {
      await taggingRulesRepo.updateOrganizationTaggingRule({ organizationId, taggingRuleId: args.taggingRuleId, taggingRule: { name: args.name, description: args.description, enabled: args.enabled, conditionMatchMode: args.conditionMatchMode, conditions: args.conditions, tagIds: args.tagIds } });
      return { success: true, message: `Document tagging rule "${args.name}" updated.` };
    },
    deleteTaggingRule: async (args: z.infer<typeof deleteTaggingRuleParams>) => {
      await taggingRulesRepo.deleteOrganizationTaggingRule({ organizationId, taggingRuleId: args.taggingRuleId });
      return { success: true, message: 'Document tagging rule deleted.' };
    },
  };

  const tools = {
    listTransactions: tool({
      description: 'List transactions for the organization. Use this to analyze patterns, find unclassified transactions, or look for specific counterparties/descriptions. Returns up to 100 rows per call, including any tags assigned to each transaction.',
      inputSchema: zodSchema(listTransactionsParams),
      execute: async (args) => {
        const { transactions } = await financesRepo.getTransactions({
          organizationId,
          pageIndex: args.pageIndex,
          pageSize: args.pageSize,
          classification: args.classification,
        });

        const { count } = await financesRepo.getTransactionsCount({
          organizationId,
          classification: args.classification,
        });

        const transactionIds = transactions.map(t => t.id);
        const { tagsByTransactionId } = await tagsRepo.getTagsByTransactionIds({ transactionIds });

        return {
          transactions: transactions.map(t => ({
            id: t.id,
            date: t.date,
            description: t.description,
            amount: t.amount,
            currency: t.currency,
            counterparty: t.counterparty,
            classification: t.classification,
            status: t.status,
            tags: (tagsByTransactionId[t.id] ?? []).map(tag => ({ id: tag.id, name: tag.name })),
          })),
          total: count,
          pageIndex: args.pageIndex,
          pageSize: args.pageSize,
        };
      },
    }),

    listClassificationRules: tool({
      description: 'List existing classification rules for this organization. Use to avoid creating duplicates.',
      inputSchema: zodSchema(emptyParams),
      execute: async () => {
        const { rules } = await financesRepo.getClassificationRules({ organizationId });
        return { rules };
      },
    }),

    createClassificationRule: tool({
      description: 'Create a new classification rule. The rule will automatically classify future transactions that match the conditions and optionally apply tags. Condition fields: counterparty, description, amount. Operators: contains, equals, starts_with, gt, lt. Classifications: expense, income, owner_transfer, internal_transfer. Use listTags first to get tag IDs if you want to apply tags.',
      inputSchema: zodSchema(createRuleParams),
      execute: async (args) => confirmationResult('createClassificationRule', args as unknown as Record<string, unknown>),
    }),

    autoClassifyTransactions: tool({
      description: 'Run auto-classification on all unclassified transactions using ALL existing active rules. Returns total classified count AND a breakdown by classification type (e.g. { expense: 40, income: 30, owner_transfer: 5 }). IMPORTANT: The count includes ALL rules, not just newly created ones. Report the breakdown accurately — do NOT attribute the total count to a single classification.',
      inputSchema: zodSchema(emptyParams),
      execute: async () => {
        const { classifiedCount, classifiedByClassification } = await runAutoClassify({ financesRepo, tagsRepo, organizationId });
        return { classifiedCount, classifiedByClassification, message: `Auto-classified ${classifiedCount} transactions.` };
      },
    }),

    searchTransactions: tool({
      description: 'Search ALL transactions across the ENTIRE history by counterparty or description. Returns aggregate stats (total spent, count, average) and up to 200 transactions. ALWAYS use this when the user asks about a specific place, merchant, or keyword. CRITICAL: Do NOT set dateFrom or dateTo unless the user EXPLICITLY says a date range like "in January" or "last 3 months". By default, search the ENTIRE history with NO date filters.',
      inputSchema: zodSchema(searchTransactionsParams),
      execute: async (args) => {
        const { stats, transactions } = await financesRepo.searchTransactionsAggregate({
          organizationId,
          searchText: args.searchText,
          dateFrom: args.dateFrom ? new Date(args.dateFrom) : undefined,
          dateTo: args.dateTo ? new Date(args.dateTo) : undefined,
        });

        return { stats, transactions };
      },
    }),

    getSpendingBreakdown: tool({
      description: 'Get a spending breakdown across ALL transactions in the ENTIRE history, grouped by counterparty or classification. Returns top groups sorted by total amount. Use this for questions like "what is my most common expense?", "where do I spend the most?", "breakdown by category", "top counterparties". Do NOT add date filters unless the user explicitly requests a specific date range.',
      inputSchema: zodSchema(spendingBreakdownParams),
      execute: async (args) => {
        const { breakdown } = await financesRepo.getSpendingBreakdown({
          organizationId,
          groupBy: args.groupBy,
          dateFrom: args.dateFrom ? new Date(args.dateFrom) : undefined,
          dateTo: args.dateTo ? new Date(args.dateTo) : undefined,
          limit: args.limit,
        });

        return { breakdown };
      },
    }),

    listTags: tool({
      description: 'List all tags for this organization. Tags can be used to label documents via tagging rules and also applied to transactions via classification rules. Use tag IDs when creating classification rules with tagIds parameter.',
      inputSchema: zodSchema(emptyParams),
      execute: async () => {
        const { tags } = await tagsRepo.getOrganizationTags({ organizationId });
        return { tags: tags.map(t => ({ id: t.id, name: t.name, color: t.color, description: t.description })) };
      },
    }),

    getOverviewStats: tool({
      description: 'Get financial overview stats: monthly income/expenses for the last 6 months and classification breakdown. Useful to understand spending patterns.',
      inputSchema: zodSchema(emptyParams),
      execute: async () => {
        const stats = await financesRepo.getOverviewStats({ organizationId });
        return stats;
      },
    }),

    getAccountBalances: tool({
      description: 'Get current account balances for all connected bank accounts. Returns the cached balance, currency, bank name, and provider for each active connection, plus the total balance converted to a single currency using real ECB exchange rates. Use this when the user asks about their balance, how much money they have, or account status. IMPORTANT: when reporting totals across different currencies, always use the totalBalance and totalBalanceCurrency from this response — never estimate exchange rates yourself.',
      inputSchema: zodSchema(emptyParams),
      execute: async () => {
        const { balances } = await financesRepo.getAccountBalances({ organizationId });

        if (balances.length === 0) {
          return { balances, totalBalance: 0, totalBalanceCurrency: 'USD', exchangeRates: {} };
        }

        const currencyCounts = new Map<string, number>();
        for (const b of balances) {
          currencyCounts.set(b.currency, (currencyCounts.get(b.currency) ?? 0) + 1);
        }
        const displayCurrency = [...currencyCounts.entries()].sort((a, b) => b[1] - a[1])[0]![0];

        const exchangeRates: Record<string, number> = {};
        let totalBalance = 0;

        for (const b of balances) {
          if (b.currency === displayCurrency) {
            totalBalance += b.balance;
          }
          else {
            try {
              if (exchangeRates[b.currency] == null) {
                exchangeRates[b.currency] = await convertCurrency({ amount: 1, from: b.currency, to: displayCurrency });
              }
              totalBalance += b.balance * exchangeRates[b.currency]!;
            }
            catch {
              // skip if conversion fails
            }
          }
        }

        return {
          balances,
          totalBalance: Math.round(totalBalance * 100) / 100,
          totalBalanceCurrency: displayCurrency,
          exchangeRates,
        };
      },
    }),

    searchDocuments: tool({
      description: 'List or search documents. Pass an empty searchQuery to list all documents, or provide a query to search by name/content. Returns document metadata (id, name, size, date) but not the full content. Call getDocumentById with the id to read a document\'s extracted text content.',
      inputSchema: zodSchema(searchDocumentsParams),
      execute: async (args) => {
        const { documents, documentsCount } = await searchOrganizationDocuments({
          organizationId,
          searchQuery: args.searchQuery,
          pageIndex: args.pageIndex,
          pageSize: args.pageSize,
          documentSearchServices,
        });

        return {
          documents: documents.map(d => ({
            id: d.id,
            name: d.name,
            originalName: d.originalName,
            mimeType: d.mimeType,
            size: d.originalSize,
            documentDate: d.documentDate,
            createdAt: d.createdAt,
          })),
          total: documentsCount,
          pageIndex: args.pageIndex,
          pageSize: args.pageSize,
        };
      },
    }),

    getDocumentById: tool({
      description: 'Get a specific document by its ID. Returns full metadata and extracted text content. Use searchDocuments first to find document IDs. The content field contains OCR/extracted text from the document.',
      inputSchema: zodSchema(getDocumentByIdParams),
      execute: async (args) => {
        const { document } = await documentsRepo.getDocumentById({ documentId: args.documentId, organizationId });

        if (!document) {
          return { error: 'Document not found' };
        }

        const { tagsByDocumentId } = await tagsRepo.getTagsByDocumentIds({ documentIds: [document.id] });
        const documentTags = tagsByDocumentId[document.id] ?? [];

        return {
          id: document.id,
          name: document.name,
          originalName: document.originalName,
          mimeType: document.mimeType,
          size: document.originalSize,
          content: document.content ?? 'No text content extracted from this document.',
          documentDate: document.documentDate,
          createdAt: document.createdAt,
          tags: documentTags.map(t => ({ id: t.id, name: t.name, color: t.color })),
        };
      },
    }),

    getDocumentStats: tool({
      description: 'Get document storage statistics: total count, total size, deleted count, etc.',
      inputSchema: zodSchema(emptyParams),
      execute: async () => {
        const stats = await documentsRepo.getOrganizationStats({ organizationId });
        return stats;
      },
    }),

    listTaggingRules: tool({
      description: 'List tagging rules that automatically tag documents based on conditions (name, content, mimeType, etc.). Each rule has conditions and actions (tags to apply).',
      inputSchema: zodSchema(emptyParams),
      execute: async () => {
        const { taggingRules } = await taggingRulesRepo.getOrganizationTaggingRules({ organizationId });
        return {
          taggingRules: taggingRules.map(r => ({
            id: r.id,
            name: r.name,
            description: r.description,
            enabled: r.enabled,
            conditionMatchMode: r.conditionMatchMode,
            conditions: r.conditions,
            actions: r.actions,
          })),
        };
      },
    }),

    getSubscriptionInfo: tool({
      description: 'Get the organization\'s current subscription status, plan, seats, and billing period.',
      inputSchema: zodSchema(emptyParams),
      execute: async () => {
        const { subscription } = await subscriptionsRepo.getActiveOrganizationSubscription({ organizationId });

        if (!subscription) {
          return { status: 'no_active_subscription' };
        }

        return {
          id: subscription.id,
          planId: subscription.planId,
          status: subscription.status,
          seatsCount: subscription.seatsCount,
          currentPeriodStart: subscription.currentPeriodStart,
          currentPeriodEnd: subscription.currentPeriodEnd,
          cancelAtPeriodEnd: subscription.cancelAtPeriodEnd,
        };
      },
    }),

    createTag: tool({
      description: 'Create a new tag in the organization. Use this when the user asks to create tags or when you need a tag that does not exist yet. Returns the created tag with its ID.',
      inputSchema: zodSchema(createTagParams),
      execute: async (args) => {
        const { tag } = await tagsRepo.createTag({
          tag: {
            name: args.name,
            color: args.color ?? '#6b7280',
            description: args.description ?? null,
            organizationId,
          },
        });
        return { tag: { id: tag!.id, name: tag!.name, color: tag!.color }, message: `Tag "${args.name}" created.` };
      },
    }),

    applyTag: tool({
      description: 'Apply a tag to a document or transaction. Use listTags to find the tag ID first. If the tag does not exist, create it with createTag first.',
      inputSchema: zodSchema(applyTagParams),
      execute: async (args) => {
        if (args.entityType === 'document') {
          await tagsRepo.addTagToDocument({ tagId: args.tagId, documentId: args.entityId });
          return { success: true, message: `Tag applied to document.` };
        }
        else {
          await tagsRepo.addTagToTransaction({ tagId: args.tagId, transactionId: args.entityId });
          return { success: true, message: `Tag applied to transaction.` };
        }
      },
    }),

    removeTag: tool({
      description: 'Remove a tag from a document or transaction.',
      inputSchema: zodSchema(removeTagParams),
      execute: async (args) => {
        if (args.entityType === 'document') {
          await tagsRepo.removeTagFromDocument({ tagId: args.tagId, documentId: args.entityId });
          return { success: true, message: `Tag removed from document.` };
        }
        else {
          await tagsRepo.removeTagFromTransaction({ tagId: args.tagId, transactionId: args.entityId });
          return { success: true, message: `Tag removed from transaction.` };
        }
      },
    }),

    updateClassificationRule: tool({
      description: 'Update an existing classification rule (transaction rule). You can change its name, classification, conditions, tags, match mode, or active status. Use listClassificationRules first to get rule IDs. Only provide the fields you want to change.',
      inputSchema: zodSchema(updateClassificationRuleParams),
      execute: async (args) => confirmationResult('updateClassificationRule', args as unknown as Record<string, unknown>),
    }),

    deleteClassificationRule: tool({
      description: 'Delete a classification rule (transaction rule). This cannot be undone.',
      inputSchema: zodSchema(deleteClassificationRuleParams),
      execute: async (args) => confirmationResult('deleteClassificationRule', args as unknown as Record<string, unknown>),
    }),

    consolidateClassificationRules: tool({
      description: 'Merge multiple classification rules into a single consolidated rule with conditionMatchMode "any". All conditions from the source rules are deduplicated and combined. The old rules are deleted. Use this when the user has many individual rules that should be one rule. Use listClassificationRules first to get rule IDs.',
      inputSchema: zodSchema(consolidateClassificationRulesParams),
      execute: async (args) => confirmationResult('consolidateClassificationRules', args as unknown as Record<string, unknown>),
    }),

    createTaggingRule: tool({
      description: 'Create a new document tagging rule. The rule will automatically tag documents whose name or content matches the conditions. Conditions use fields: "name" (document name), "content" (extracted text). Operators: equal, not_equal, contains, not_contains, starts_with, ends_with. You MUST provide at least one tag ID — use listTags to find IDs, or createTag to make a new tag first.',
      inputSchema: zodSchema(createTaggingRuleParams),
      execute: async (args) => confirmationResult('createTaggingRule', args as unknown as Record<string, unknown>),
    }),

    updateTaggingRule: tool({
      description: 'Update an existing document tagging rule. Replaces conditions and tags entirely. Use listTaggingRules to find rule IDs.',
      inputSchema: zodSchema(updateTaggingRuleParams),
      execute: async (args) => confirmationResult('updateTaggingRule', args as unknown as Record<string, unknown>),
    }),

    deleteTaggingRule: tool({
      description: 'Delete a document tagging rule. This cannot be undone.',
      inputSchema: zodSchema(deleteTaggingRuleParams),
      execute: async (args) => confirmationResult('deleteTaggingRule', args as unknown as Record<string, unknown>),
    }),

    analyzeUnclassifiedTransactions: tool({
      description: 'Analyze ALL unclassified transactions. Returns pre-extracted patterns AND existing classification rules. Use existing rules to avoid duplicates — if a pattern\'s keyword is already covered by an existing rule condition, SKIP it. Group remaining patterns by suggestedClassification and create CONSOLIDATED rules (one per classification with conditionMatchMode "any" and all keywords as separate conditions).',
      inputSchema: zodSchema(emptyParams),
      execute: async () => {
        const [{ totalUnclassified, patterns }, { rules: existingRules }] = await Promise.all([
          financesRepo.getUnclassifiedCounterpartySummary({ organizationId }),
          financesRepo.getClassificationRules({ organizationId }),
        ]);

        // Extract existing condition values for duplicate detection
        const existingConditionValues = existingRules.flatMap(r =>
          (r.conditions as Array<{ field: string; operator: string; value: string }>)
            .map(c => c.value.toLowerCase()),
        );

        // Filter out patterns already covered by existing rules
        const newPatterns = patterns.filter(p =>
          !existingConditionValues.some(v =>
            p.keyword.toLowerCase().includes(v) || v.includes(p.keyword.toLowerCase()),
          ),
        );

        return {
          totalUnclassified,
          patterns: newPatterns,
          existingRuleCount: existingRules.length,
          filteredOutCount: patterns.length - newPatterns.length,
        };
      },
    }),

    ...(tavilyApiKey ? {
      webSearch: tool({
        description: 'Search the internet for up-to-date information. Use this when the user asks about legal requirements, regulations, filing deadlines, tax rules, compliance topics, country-specific business information, or anything that requires current external knowledge. Combine with searchDocuments/getDocumentById to cross-reference internet info with the user\'s own documents. Examples: "What are the Wyoming LLC annual report requirements?", "Spain tax obligations for US LLC owners", "How to fill out Form W-8BEN".',
        inputSchema: zodSchema(webSearchParams),
        execute: async (args) => {
          const response = await fetch('https://api.tavily.com/search', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              api_key: tavilyApiKey,
              query: args.query,
              search_depth: args.searchDepth,
              max_results: args.maxResults,
              include_answer: true,
            }),
          });

          if (!response.ok) {
            return { error: `Web search failed (${response.status})` };
          }

          const data = await response.json() as {
            answer?: string;
            results: Array<{ title: string; url: string; content: string; score: number }>;
          };

          return {
            answer: data.answer ?? null,
            results: data.results.map(r => ({
              title: r.title,
              url: r.url,
              snippet: r.content,
              relevanceScore: r.score,
            })),
            query: args.query,
          };
        },
      }),
    } : {}),
  };

  return { tools, executors };
}

async function runAutoClassify({ financesRepo, tagsRepo, organizationId }: { financesRepo: FinancesRepository; tagsRepo: ReturnType<typeof createTagsRepository>; organizationId: string }) {
  return autoClassifyTransactions({ financesRepository: financesRepo, tagsRepository: tagsRepo, organizationId });
}
