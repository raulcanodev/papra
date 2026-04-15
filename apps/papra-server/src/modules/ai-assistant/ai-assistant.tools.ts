import type { Database } from '../app/database/database.types';
import type { DocumentSearchServices } from '../documents/document-search/document-search.types';
import type { FinancesRepository } from '../finances/finances.repository';
import { tool, zodSchema } from 'ai';
import { z } from 'zod';
import { searchOrganizationDocuments } from '../documents/document-search/document-search.usecase';
import { createDocumentsRepository } from '../documents/documents.repository';
import { createFinancesRepository } from '../finances/finances.repository';
import { autoClassifyTransactions } from '../finances/finances.usecases';
import { createSubscriptionsRepository } from '../subscriptions/subscriptions.repository';
import { createTaggingRulesRepository } from '../tagging-rules/tagging-rules.repository';
import { createTagsRepository } from '../tags/tags.repository';

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

const searchTransactionsParams = z.object({
  searchText: z.string().min(1).describe('Text to search for in counterparty name or description. Case-insensitive partial match.'),
  dateFrom: z.string().optional().describe('Optional start date (ISO 8601). ONLY set this if the user explicitly asks to filter by a specific date range. Do NOT guess or add date filters.'),
  dateTo: z.string().optional().describe('Optional end date (ISO 8601). ONLY set this if the user explicitly asks to filter by a specific date range. Do NOT guess or add date filters.'),
});

const spendingBreakdownParams = z.object({
  groupBy: z.enum(['counterparty', 'classification']).default('counterparty').describe('Group spending by counterparty or by classification'),
  dateFrom: z.string().optional().describe('Optional start date (ISO 8601)'),
  dateTo: z.string().optional().describe('Optional end date (ISO 8601)'),
  limit: z.number().int().min(1).max(50).default(30).describe('Max number of groups to return'),
});

export function createAssistantTools({ db, organizationId, authSecret, documentSearchServices }: {
  db: Database;
  organizationId: string;
  authSecret: string;
  documentSearchServices: DocumentSearchServices;
}) {
  const financesRepo = createFinancesRepository({ db, authSecret });
  const tagsRepo = createTagsRepository({ db });
  const documentsRepo = createDocumentsRepository({ db });
  const taggingRulesRepo = createTaggingRulesRepository({ db });
  const subscriptionsRepo = createSubscriptionsRepository({ db });

  return {
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
      execute: async (args) => {
        const { rule } = await financesRepo.createClassificationRule({
          rule: {
            organizationId,
            name: args.name,
            classification: args.classification,
            conditions: args.conditions,
            conditionMatchMode: args.conditionMatchMode,
            tagIds: args.tagIds,
            priority: 0,
          },
        });
        return { rule, message: `Classification rule "${args.name}" created successfully.` };
      },
    }),

    autoClassifyTransactions: tool({
      description: 'Run auto-classification on all unclassified transactions using existing rules. Also applies any tags configured on matching rules. Returns the number of transactions that were classified.',
      inputSchema: zodSchema(emptyParams),
      execute: async () => {
        const { classifiedCount } = await runAutoClassify({ financesRepo, tagsRepo, organizationId });
        return { classifiedCount, message: `Auto-classified ${classifiedCount} transactions.` };
      },
    }),

    searchTransactions: tool({
      description: 'Search ALL transactions across the ENTIRE history by counterparty or description text and get aggregate statistics (total spent, count, average, date range). ALWAYS use this instead of listTransactions when the user asks about a specific place, merchant, or keyword. Do NOT add date filters unless the user explicitly requests a specific date range. Returns up to 200 matching transactions plus aggregated stats.',
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
  };
}

async function runAutoClassify({ financesRepo, tagsRepo, organizationId }: { financesRepo: FinancesRepository; tagsRepo: ReturnType<typeof createTagsRepository>; organizationId: string }) {
  return autoClassifyTransactions({ financesRepository: financesRepo, tagsRepository: tagsRepo, organizationId });
}
