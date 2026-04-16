import type { RouteDefinitionContext } from '../app/server.types';
import { z } from 'zod';
import { requireAuthentication } from '../app/auth/auth.middleware';
import { getUser } from '../app/auth/auth.models';
import { createCustomPropertiesRepository } from '../custom-properties/custom-properties.repository';
import { requireFeatureFlag } from '../feature-flags/feature-flags.middleware';
import { organizationIdSchema } from '../organizations/organization.schemas.legacy';
import { createOrganizationsRepository } from '../organizations/organizations.repository';
import { ensureUserIsInOrganization } from '../organizations/organizations.usecases';
import { legacyValidateJsonBody, legacyValidateParams, legacyValidateQuery } from '../shared/validation/validation.legacy';
import { createTagNotFoundError } from '../tags/tags.errors';
import { createTagsRepository } from '../tags/tags.repository';
import { convertCurrency } from './exchange-rates';
import { BANK_PROVIDERS, BILLING_CYCLES, TRANSACTION_CLASSIFICATIONS } from './finances.constants';
import { createFinancesRepository } from './finances.repository';
import { addBankConnection, autoClassifyTransactions, refreshAccountBalances, syncBankTransactions } from './finances.usecases';
import { getBankProviderAdapter } from './providers/provider.registry';

export function registerFinancesRoutes(context: RouteDefinitionContext) {
  setupGetBankConnectionsRoute(context);
  setupCreateBankConnectionRoute(context);
  setupUpdateBankConnectionRoute(context);
  setupDeleteBankConnectionRoute(context);
  setupSyncBankConnectionRoute(context);
  setupGetTransactionsRoute(context);
  setupUpdateTransactionClassificationRoute(context);
  setupGetBankProviderAccountsRoute(context);
  setupGetClassificationRulesRoute(context);
  setupCreateClassificationRuleRoute(context);
  setupUpdateClassificationRuleRoute(context);
  setupDeleteClassificationRuleRoute(context);
  setupAutoClassifyRoute(context);
  setupGetOverviewRoute(context);
  setupGetSubscriptionsRoute(context);
  setupCreateSubscriptionRoute(context);
  setupUpdateSubscriptionRoute(context);
  setupDeleteSubscriptionRoute(context);
  setupGetTransactionTagsRoute(context);
  setupAddTransactionTagRoute(context);
  setupRemoveTransactionTagRoute(context);
  setupGetTransactionCustomPropertiesRoute(context);
  setupSetTransactionCustomPropertyRoute(context);
  setupDeleteTransactionCustomPropertyRoute(context);
}

function setupGetBankConnectionsRoute({ app, db, config }: RouteDefinitionContext) {
  app.get(
    '/api/organizations/:organizationId/finances/bank-connections',
    requireAuthentication(),
    requireFeatureFlag({ flagId: 'llc_finances', db }),
    legacyValidateParams(z.object({ organizationId: organizationIdSchema })),
    async (context) => {
      const { userId } = getUser({ context });
      const { organizationId } = context.req.valid('param');

      const organizationsRepository = createOrganizationsRepository({ db });
      await ensureUserIsInOrganization({ userId, organizationId, organizationsRepository });

      const financesRepository = createFinancesRepository({ db, authSecret: config.auth.secret });
      const { bankConnections } = await financesRepository.getBankConnections({ organizationId });

      return context.json({ bankConnections });
    },
  );
}

function setupCreateBankConnectionRoute({ app, db, config }: RouteDefinitionContext) {
  app.post(
    '/api/organizations/:organizationId/finances/bank-connections',
    requireAuthentication(),
    requireFeatureFlag({ flagId: 'llc_finances', db }),
    legacyValidateParams(z.object({ organizationId: organizationIdSchema })),
    legacyValidateJsonBody(z.object({
      provider: z.enum(BANK_PROVIDERS),
      name: z.string().min(1).max(100),
      apiKey: z.string().min(1),
      accountId: z.string().optional(),
    })),
    async (context) => {
      const { userId } = getUser({ context });
      const { organizationId } = context.req.valid('param');
      const { provider, name, apiKey, accountId } = context.req.valid('json');

      const organizationsRepository = createOrganizationsRepository({ db });
      await ensureUserIsInOrganization({ userId, organizationId, organizationsRepository });

      const financesRepository = createFinancesRepository({ db, authSecret: config.auth.secret });
      const { bankConnection } = await addBankConnection({
        organizationId,
        provider,
        name,
        apiKey,
        accountId,
        financesRepository,
      });

      return context.json({
        bankConnection: {
          id: bankConnection!.id,
          provider: bankConnection!.provider,
          name: bankConnection!.name,
          isActive: bankConnection!.isActive,
          createdAt: bankConnection!.createdAt,
        },
      });
    },
  );
}

function setupUpdateBankConnectionRoute({ app, db, config }: RouteDefinitionContext) {
  app.patch(
    '/api/organizations/:organizationId/finances/bank-connections/:bankConnectionId',
    requireAuthentication(),
    requireFeatureFlag({ flagId: 'llc_finances', db }),
    legacyValidateParams(z.object({
      organizationId: organizationIdSchema,
      bankConnectionId: z.string(),
    })),
    legacyValidateJsonBody(z.object({
      name: z.string().min(1).max(100).optional(),
      accountId: z.string().nullable().optional(),
      apiKey: z.string().min(1).optional(),
    })),
    async (context) => {
      const { userId } = getUser({ context });
      const { organizationId, bankConnectionId } = context.req.valid('param');
      const { name, accountId, apiKey } = context.req.valid('json');

      const organizationsRepository = createOrganizationsRepository({ db });
      await ensureUserIsInOrganization({ userId, organizationId, organizationsRepository });

      const financesRepository = createFinancesRepository({ db, authSecret: config.auth.secret });
      const { bankConnection } = await financesRepository.updateBankConnection({
        bankConnectionId,
        organizationId,
        name,
        providerAccountId: accountId,
        apiKey,
      });

      return context.json({ bankConnection });
    },
  );
}

function setupDeleteBankConnectionRoute({ app, db, config }: RouteDefinitionContext) {
  app.delete(
    '/api/organizations/:organizationId/finances/bank-connections/:bankConnectionId',
    requireAuthentication(),
    requireFeatureFlag({ flagId: 'llc_finances', db }),
    legacyValidateParams(z.object({
      organizationId: organizationIdSchema,
      bankConnectionId: z.string(),
    })),
    async (context) => {
      const { userId } = getUser({ context });
      const { organizationId, bankConnectionId } = context.req.valid('param');

      const organizationsRepository = createOrganizationsRepository({ db });
      await ensureUserIsInOrganization({ userId, organizationId, organizationsRepository });

      const financesRepository = createFinancesRepository({ db, authSecret: config.auth.secret });
      await financesRepository.deleteBankConnection({ bankConnectionId, organizationId });

      return context.json({ success: true });
    },
  );
}

function setupSyncBankConnectionRoute({ app, db, config }: RouteDefinitionContext) {
  app.post(
    '/api/organizations/:organizationId/finances/bank-connections/:bankConnectionId/sync',
    requireAuthentication(),
    requireFeatureFlag({ flagId: 'llc_finances', db }),
    legacyValidateParams(z.object({
      organizationId: organizationIdSchema,
      bankConnectionId: z.string(),
    })),
    legacyValidateQuery(z.object({
      fullSync: z.coerce.boolean().optional().default(false),
    })),
    async (context) => {
      const { userId } = getUser({ context });
      const { organizationId, bankConnectionId } = context.req.valid('param');
      const { fullSync } = context.req.valid('query');

      const organizationsRepository = createOrganizationsRepository({ db });
      await ensureUserIsInOrganization({ userId, organizationId, organizationsRepository });

      const financesRepository = createFinancesRepository({ db, authSecret: config.auth.secret });
      const { insertedCount } = await syncBankTransactions({
        bankConnectionId,
        organizationId,
        financesRepository,
        fullSync,
      });

      return context.json({ insertedCount });
    },
  );
}

function setupGetTransactionsRoute({ app, db, config }: RouteDefinitionContext) {
  app.get(
    '/api/organizations/:organizationId/finances/transactions',
    requireAuthentication(),
    requireFeatureFlag({ flagId: 'llc_finances', db }),
    legacyValidateParams(z.object({ organizationId: organizationIdSchema })),
    legacyValidateQuery(z.object({
      pageIndex: z.coerce.number().int().min(0).default(0),
      pageSize: z.coerce.number().int().min(1).max(100).default(50),
      bankConnectionId: z.string().optional(),
      classification: z.string().optional(),
    }), { allowAdditionalFields: true }),
    async (context) => {
      const { userId } = getUser({ context });
      const { organizationId } = context.req.valid('param');
      const { pageIndex, pageSize, bankConnectionId, classification } = context.req.valid('query');

      const organizationsRepository = createOrganizationsRepository({ db });
      await ensureUserIsInOrganization({ userId, organizationId, organizationsRepository });

      const financesRepository = createFinancesRepository({ db, authSecret: config.auth.secret });

      const [{ transactions }, { count: transactionsCount }] = await Promise.all([
        financesRepository.getTransactions({ organizationId, pageIndex, pageSize, bankConnectionId, classification }),
        financesRepository.getTransactionsCount({ organizationId, bankConnectionId, classification }),
      ]);

      return context.json({ transactions, transactionsCount });
    },
  );
}

function setupUpdateTransactionClassificationRoute({ app, db, config }: RouteDefinitionContext) {
  app.patch(
    '/api/organizations/:organizationId/finances/transactions/:transactionId',
    requireAuthentication(),
    requireFeatureFlag({ flagId: 'llc_finances', db }),
    legacyValidateParams(z.object({
      organizationId: organizationIdSchema,
      transactionId: z.string(),
    })),
    legacyValidateJsonBody(z.object({
      classification: z.enum(TRANSACTION_CLASSIFICATIONS).nullable(),
    })),
    async (context) => {
      const { userId } = getUser({ context });
      const { organizationId, transactionId } = context.req.valid('param');
      const { classification } = context.req.valid('json');

      const organizationsRepository = createOrganizationsRepository({ db });
      await ensureUserIsInOrganization({ userId, organizationId, organizationsRepository });

      const financesRepository = createFinancesRepository({ db, authSecret: config.auth.secret });
      const { transaction } = await financesRepository.updateTransactionClassification({
        transactionId,
        organizationId,
        classification,
      });

      return context.json({ transaction });
    },
  );
}

function setupGetBankProviderAccountsRoute({ app, db }: RouteDefinitionContext) {
  app.post(
    '/api/organizations/:organizationId/finances/bank-connections/accounts',
    requireAuthentication(),
    requireFeatureFlag({ flagId: 'llc_finances', db }),
    legacyValidateParams(z.object({ organizationId: organizationIdSchema })),
    legacyValidateJsonBody(z.object({
      provider: z.enum(BANK_PROVIDERS),
      apiKey: z.string().min(1),
    })),
    async (context) => {
      const { userId } = getUser({ context });
      const { organizationId } = context.req.valid('param');
      const { provider, apiKey } = context.req.valid('json');

      const organizationsRepository = createOrganizationsRepository({ db });
      await ensureUserIsInOrganization({ userId, organizationId, organizationsRepository });

      const adapter = getBankProviderAdapter({ provider });
      const { accounts } = await adapter.fetchAccounts({ apiKey });

      return context.json({ accounts });
    },
  );
}

const RULE_FIELDS = ['counterparty', 'description', 'amount'] as const;
const RULE_OPERATORS = ['contains', 'equals', 'starts_with', 'gt', 'lt'] as const;
const CONDITION_MATCH_MODES = ['all', 'any'] as const;

const conditionSchema = z.object({
  field: z.enum(RULE_FIELDS),
  operator: z.enum(RULE_OPERATORS),
  value: z.string().min(1),
});

function setupGetClassificationRulesRoute({ app, db, config }: RouteDefinitionContext) {
  app.get(
    '/api/organizations/:organizationId/finances/classification-rules',
    requireAuthentication(),
    requireFeatureFlag({ flagId: 'llc_finances', db }),
    legacyValidateParams(z.object({ organizationId: organizationIdSchema })),
    async (context) => {
      const { userId } = getUser({ context });
      const { organizationId } = context.req.valid('param');

      const organizationsRepository = createOrganizationsRepository({ db });
      await ensureUserIsInOrganization({ userId, organizationId, organizationsRepository });

      const financesRepository = createFinancesRepository({ db, authSecret: config.auth.secret });
      const { rules } = await financesRepository.getClassificationRules({ organizationId });

      return context.json({ rules });
    },
  );
}

function setupCreateClassificationRuleRoute({ app, db, config }: RouteDefinitionContext) {
  app.post(
    '/api/organizations/:organizationId/finances/classification-rules',
    requireAuthentication(),
    requireFeatureFlag({ flagId: 'llc_finances', db }),
    legacyValidateParams(z.object({ organizationId: organizationIdSchema })),
    legacyValidateJsonBody(z.object({
      name: z.string().min(1).max(100),
      classification: z.enum(TRANSACTION_CLASSIFICATIONS),
      conditions: z.array(conditionSchema).min(1),
      conditionMatchMode: z.enum(CONDITION_MATCH_MODES).default('all'),
      tagIds: z.array(z.string()).default([]),
      priority: z.number().int().min(0).default(0),
    })),
    async (context) => {
      const { userId } = getUser({ context });
      const { organizationId } = context.req.valid('param');
      const body = context.req.valid('json');

      const organizationsRepository = createOrganizationsRepository({ db });
      await ensureUserIsInOrganization({ userId, organizationId, organizationsRepository });

      const financesRepository = createFinancesRepository({ db, authSecret: config.auth.secret });
      const { rule } = await financesRepository.createClassificationRule({
        rule: { ...body, organizationId },
      });

      return context.json({ rule }, 201);
    },
  );
}

function setupUpdateClassificationRuleRoute({ app, db, config }: RouteDefinitionContext) {
  app.patch(
    '/api/organizations/:organizationId/finances/classification-rules/:ruleId',
    requireAuthentication(),
    requireFeatureFlag({ flagId: 'llc_finances', db }),
    legacyValidateParams(z.object({
      organizationId: organizationIdSchema,
      ruleId: z.string(),
    })),
    legacyValidateJsonBody(z.object({
      name: z.string().min(1).max(100).optional(),
      classification: z.enum(TRANSACTION_CLASSIFICATIONS).optional(),
      conditions: z.array(conditionSchema).min(1).optional(),
      conditionMatchMode: z.enum(CONDITION_MATCH_MODES).optional(),
      tagIds: z.array(z.string()).optional(),
      priority: z.number().int().min(0).optional(),
      isActive: z.boolean().optional(),
    })),
    async (context) => {
      const { userId } = getUser({ context });
      const { organizationId, ruleId } = context.req.valid('param');
      const updates = context.req.valid('json');

      const organizationsRepository = createOrganizationsRepository({ db });
      await ensureUserIsInOrganization({ userId, organizationId, organizationsRepository });

      const financesRepository = createFinancesRepository({ db, authSecret: config.auth.secret });
      const { rule } = await financesRepository.updateClassificationRule({
        ruleId,
        organizationId,
        updates,
      });

      return context.json({ rule });
    },
  );
}

function setupDeleteClassificationRuleRoute({ app, db, config }: RouteDefinitionContext) {
  app.delete(
    '/api/organizations/:organizationId/finances/classification-rules/:ruleId',
    requireAuthentication(),
    requireFeatureFlag({ flagId: 'llc_finances', db }),
    legacyValidateParams(z.object({
      organizationId: organizationIdSchema,
      ruleId: z.string(),
    })),
    async (context) => {
      const { userId } = getUser({ context });
      const { organizationId, ruleId } = context.req.valid('param');

      const organizationsRepository = createOrganizationsRepository({ db });
      await ensureUserIsInOrganization({ userId, organizationId, organizationsRepository });

      const financesRepository = createFinancesRepository({ db, authSecret: config.auth.secret });
      await financesRepository.deleteClassificationRule({ ruleId, organizationId });

      return context.json({ success: true });
    },
  );
}

function setupAutoClassifyRoute({ app, db, config }: RouteDefinitionContext) {
  app.post(
    '/api/organizations/:organizationId/finances/auto-classify',
    requireAuthentication(),
    requireFeatureFlag({ flagId: 'llc_finances', db }),
    legacyValidateParams(z.object({ organizationId: organizationIdSchema })),
    async (context) => {
      const { userId } = getUser({ context });
      const { organizationId } = context.req.valid('param');

      const organizationsRepository = createOrganizationsRepository({ db });
      await ensureUserIsInOrganization({ userId, organizationId, organizationsRepository });

      const financesRepository = createFinancesRepository({ db, authSecret: config.auth.secret });
      const tagsRepository = createTagsRepository({ db });
      const { classifiedCount } = await autoClassifyTransactions({ organizationId, financesRepository, tagsRepository });

      return context.json({ classifiedCount });
    },
  );
}

async function computeTotalBalance({ balances }: { balances: Array<{ balance: number; currency: string }> }) {
  if (balances.length === 0) {
    return { totalBalance: 0, totalBalanceCurrency: 'USD', exchangeRates: {} as Record<string, number> };
  }

  // Pick the most common currency as the display currency
  const currencyCounts = new Map<string, number>();
  for (const b of balances) {
    currencyCounts.set(b.currency, (currencyCounts.get(b.currency) ?? 0) + 1);
  }
  const displayCurrency = [...currencyCounts.entries()].sort((a, b) => b[1] - a[1])[0]![0];

  const uniqueCurrencies = [...new Set(balances.map(b => b.currency))];
  const needsConversion = uniqueCurrencies.length > 1;

  const exchangeRates: Record<string, number> = {};
  if (needsConversion) {
    for (const currency of uniqueCurrencies) {
      if (currency !== displayCurrency) {
        try {
          const converted = await convertCurrency({ amount: 1, from: currency, to: displayCurrency });
          exchangeRates[currency] = converted;
        }
        catch {
          // If conversion fails, skip this currency from total
        }
      }
    }
  }

  let totalBalance = 0;
  for (const b of balances) {
    if (b.currency === displayCurrency) {
      totalBalance += b.balance;
    }
    else {
      const rate = exchangeRates[b.currency];
      if (rate != null) {
        totalBalance += b.balance * rate;
      }
    }
  }

  return { totalBalance, totalBalanceCurrency: displayCurrency, exchangeRates };
}

function setupGetOverviewRoute({ app, db, config }: RouteDefinitionContext) {
  app.get(
    '/api/organizations/:organizationId/finances/overview',
    requireAuthentication(),
    requireFeatureFlag({ flagId: 'llc_finances', db }),
    legacyValidateParams(z.object({ organizationId: organizationIdSchema })),
    async (context) => {
      const { userId } = getUser({ context });
      const { organizationId } = context.req.valid('param');

      const organizationsRepository = createOrganizationsRepository({ db });
      await ensureUserIsInOrganization({ userId, organizationId, organizationsRepository });

      const financesRepository = createFinancesRepository({ db, authSecret: config.auth.secret });
      const [stats, { balances }] = await Promise.all([
        financesRepository.getOverviewStats({ organizationId }),
        financesRepository.getAccountBalances({ organizationId }),
      ]);

      let accountBalances = balances;

      // If no cached balances yet, fetch them from providers
      if (accountBalances.length === 0) {
        await refreshAccountBalances({ organizationId, financesRepository });
        const refreshed = await financesRepository.getAccountBalances({ organizationId });
        accountBalances = refreshed.balances;
      }

      const { totalBalance, totalBalanceCurrency, exchangeRates } = await computeTotalBalance({ balances: accountBalances });

      return context.json({
        ...stats,
        accountBalances,
        totalBalance,
        totalBalanceCurrency,
        exchangeRates,
      });
    },
  );
}

function setupGetSubscriptionsRoute({ app, db, config }: RouteDefinitionContext) {
  app.get(
    '/api/organizations/:organizationId/finances/subscriptions',
    requireAuthentication(),
    requireFeatureFlag({ flagId: 'llc_finances', db }),
    legacyValidateParams(z.object({ organizationId: organizationIdSchema })),
    async (context) => {
      const { userId } = getUser({ context });
      const { organizationId } = context.req.valid('param');

      const organizationsRepository = createOrganizationsRepository({ db });
      await ensureUserIsInOrganization({ userId, organizationId, organizationsRepository });

      const financesRepository = createFinancesRepository({ db, authSecret: config.auth.secret });
      const { subscriptions } = await financesRepository.getSubscriptions({ organizationId });

      return context.json({ subscriptions });
    },
  );
}

function setupCreateSubscriptionRoute({ app, db, config }: RouteDefinitionContext) {
  app.post(
    '/api/organizations/:organizationId/finances/subscriptions',
    requireAuthentication(),
    requireFeatureFlag({ flagId: 'llc_finances', db }),
    legacyValidateParams(z.object({ organizationId: organizationIdSchema })),
    legacyValidateJsonBody(z.object({
      name: z.string().min(1).max(100),
      amount: z.number().positive(),
      currency: z.string().length(3).default('USD'),
      billingCycle: z.enum(BILLING_CYCLES).default('monthly'),
      nextPaymentAt: z.coerce.date().nullable().optional(),
      category: z.enum(TRANSACTION_CLASSIFICATIONS).nullable().optional(),
      notes: z.string().max(500).nullable().optional(),
    })),
    async (context) => {
      const { userId } = getUser({ context });
      const { organizationId } = context.req.valid('param');
      const body = context.req.valid('json');

      const organizationsRepository = createOrganizationsRepository({ db });
      await ensureUserIsInOrganization({ userId, organizationId, organizationsRepository });

      const financesRepository = createFinancesRepository({ db, authSecret: config.auth.secret });
      const { subscription } = await financesRepository.createSubscription({
        subscription: { ...body, organizationId },
      });

      return context.json({ subscription }, 201);
    },
  );
}

function setupUpdateSubscriptionRoute({ app, db, config }: RouteDefinitionContext) {
  app.patch(
    '/api/organizations/:organizationId/finances/subscriptions/:subscriptionId',
    requireAuthentication(),
    requireFeatureFlag({ flagId: 'llc_finances', db }),
    legacyValidateParams(z.object({
      organizationId: organizationIdSchema,
      subscriptionId: z.string(),
    })),
    legacyValidateJsonBody(z.object({
      name: z.string().min(1).max(100).optional(),
      amount: z.number().positive().optional(),
      currency: z.string().length(3).optional(),
      billingCycle: z.enum(BILLING_CYCLES).optional(),
      nextPaymentAt: z.coerce.date().nullable().optional(),
      category: z.enum(TRANSACTION_CLASSIFICATIONS).nullable().optional(),
      notes: z.string().max(500).nullable().optional(),
      isActive: z.boolean().optional(),
    })),
    async (context) => {
      const { userId } = getUser({ context });
      const { organizationId, subscriptionId } = context.req.valid('param');
      const updates = context.req.valid('json');

      const organizationsRepository = createOrganizationsRepository({ db });
      await ensureUserIsInOrganization({ userId, organizationId, organizationsRepository });

      const financesRepository = createFinancesRepository({ db, authSecret: config.auth.secret });
      const { subscription } = await financesRepository.updateSubscription({
        subscriptionId,
        organizationId,
        updates,
      });

      return context.json({ subscription });
    },
  );
}

function setupDeleteSubscriptionRoute({ app, db, config }: RouteDefinitionContext) {
  app.delete(
    '/api/organizations/:organizationId/finances/subscriptions/:subscriptionId',
    requireAuthentication(),
    requireFeatureFlag({ flagId: 'llc_finances', db }),
    legacyValidateParams(z.object({
      organizationId: organizationIdSchema,
      subscriptionId: z.string(),
    })),
    async (context) => {
      const { userId } = getUser({ context });
      const { organizationId, subscriptionId } = context.req.valid('param');

      const organizationsRepository = createOrganizationsRepository({ db });
      await ensureUserIsInOrganization({ userId, organizationId, organizationsRepository });

      const financesRepository = createFinancesRepository({ db, authSecret: config.auth.secret });
      await financesRepository.deleteSubscription({ subscriptionId, organizationId });

      return context.json({ success: true });
    },
  );
}

// --- Transaction Tags Routes ---

function setupGetTransactionTagsRoute({ app, db, config }: RouteDefinitionContext) {
  app.get(
    '/api/organizations/:organizationId/finances/transactions/:transactionId/tags',
    requireAuthentication(),
    requireFeatureFlag({ flagId: 'llc_finances', db }),
    legacyValidateParams(z.object({
      organizationId: organizationIdSchema,
      transactionId: z.string(),
    })),
    async (context) => {
      const { userId } = getUser({ context });
      const { organizationId, transactionId } = context.req.valid('param');

      const organizationsRepository = createOrganizationsRepository({ db });
      await ensureUserIsInOrganization({ userId, organizationId, organizationsRepository });

      const financesRepository = createFinancesRepository({ db, authSecret: config.auth.secret });
      await financesRepository.getTransactionById({ transactionId, organizationId });

      const tagsRepository = createTagsRepository({ db });
      const { tagsByTransactionId } = await tagsRepository.getTagsByTransactionIds({ transactionIds: [transactionId] });

      return context.json({ tags: tagsByTransactionId[transactionId] ?? [] });
    },
  );
}

function setupAddTransactionTagRoute({ app, db, config }: RouteDefinitionContext) {
  app.post(
    '/api/organizations/:organizationId/finances/transactions/:transactionId/tags',
    requireAuthentication(),
    requireFeatureFlag({ flagId: 'llc_finances', db }),
    legacyValidateParams(z.object({
      organizationId: organizationIdSchema,
      transactionId: z.string(),
    })),
    legacyValidateJsonBody(z.object({
      tagId: z.string(),
    })),
    async (context) => {
      const { userId } = getUser({ context });
      const { organizationId, transactionId } = context.req.valid('param');
      const { tagId } = context.req.valid('json');

      const organizationsRepository = createOrganizationsRepository({ db });
      await ensureUserIsInOrganization({ userId, organizationId, organizationsRepository });

      const financesRepository = createFinancesRepository({ db, authSecret: config.auth.secret });
      await financesRepository.getTransactionById({ transactionId, organizationId });

      const tagsRepository = createTagsRepository({ db });
      const { tag } = await tagsRepository.getTagById({ tagId, organizationId });

      if (!tag) {
        throw createTagNotFoundError();
      }

      await tagsRepository.addTagToTransaction({ tagId, transactionId });

      return context.json({ tag }, 201);
    },
  );
}

function setupRemoveTransactionTagRoute({ app, db, config }: RouteDefinitionContext) {
  app.delete(
    '/api/organizations/:organizationId/finances/transactions/:transactionId/tags/:tagId',
    requireAuthentication(),
    requireFeatureFlag({ flagId: 'llc_finances', db }),
    legacyValidateParams(z.object({
      organizationId: organizationIdSchema,
      transactionId: z.string(),
      tagId: z.string(),
    })),
    async (context) => {
      const { userId } = getUser({ context });
      const { organizationId, transactionId, tagId } = context.req.valid('param');

      const organizationsRepository = createOrganizationsRepository({ db });
      await ensureUserIsInOrganization({ userId, organizationId, organizationsRepository });

      const financesRepository = createFinancesRepository({ db, authSecret: config.auth.secret });
      await financesRepository.getTransactionById({ transactionId, organizationId });

      const tagsRepository = createTagsRepository({ db });
      const { tag } = await tagsRepository.getTagById({ tagId, organizationId });

      if (!tag) {
        throw createTagNotFoundError();
      }

      await tagsRepository.removeTagFromTransaction({ tagId, transactionId });

      return context.body(null, 204);
    },
  );
}

// --- Transaction Custom Properties Routes ---

function setupGetTransactionCustomPropertiesRoute({ app, db, config }: RouteDefinitionContext) {
  app.get(
    '/api/organizations/:organizationId/finances/transactions/:transactionId/custom-properties',
    requireAuthentication(),
    requireFeatureFlag({ flagId: 'llc_finances', db }),
    legacyValidateParams(z.object({
      organizationId: organizationIdSchema,
      transactionId: z.string(),
    })),
    async (context) => {
      const { userId } = getUser({ context });
      const { organizationId, transactionId } = context.req.valid('param');

      const organizationsRepository = createOrganizationsRepository({ db });
      await ensureUserIsInOrganization({ userId, organizationId, organizationsRepository });

      const financesRepository = createFinancesRepository({ db, authSecret: config.auth.secret });
      await financesRepository.getTransactionById({ transactionId, organizationId });

      const customPropertiesRepository = createCustomPropertiesRepository({ db });
      const { values } = await customPropertiesRepository.getTransactionCustomPropertyValues({ transactionId });

      return context.json({ values });
    },
  );
}

function setupSetTransactionCustomPropertyRoute({ app, db, config }: RouteDefinitionContext) {
  app.put(
    '/api/organizations/:organizationId/finances/transactions/:transactionId/custom-properties/:propertyDefinitionId',
    requireAuthentication(),
    requireFeatureFlag({ flagId: 'llc_finances', db }),
    legacyValidateParams(z.object({
      organizationId: organizationIdSchema,
      transactionId: z.string(),
      propertyDefinitionId: z.string(),
    })),
    legacyValidateJsonBody(z.object({
      values: z.array(z.object({
        textValue: z.string().nullable().optional(),
        numberValue: z.number().nullable().optional(),
        dateValue: z.string().datetime().nullable().optional(),
        booleanValue: z.boolean().nullable().optional(),
        selectOptionId: z.string().nullable().optional(),
      })).min(1),
    })),
    async (context) => {
      const { userId } = getUser({ context });
      const { organizationId, transactionId, propertyDefinitionId } = context.req.valid('param');
      const { values } = context.req.valid('json');

      const organizationsRepository = createOrganizationsRepository({ db });
      await ensureUserIsInOrganization({ userId, organizationId, organizationsRepository });

      const financesRepository = createFinancesRepository({ db, authSecret: config.auth.secret });
      await financesRepository.getTransactionById({ transactionId, organizationId });

      const customPropertiesRepository = createCustomPropertiesRepository({ db });
      const { definition } = await customPropertiesRepository.getPropertyDefinitionById({ propertyDefinitionId, organizationId });

      if (!definition) {
        throw new Error('Property definition not found');
      }

      await customPropertiesRepository.setTransactionCustomPropertyValue({
        transactionId,
        propertyDefinitionId,
        values: values.map(v => ({
          ...v,
          dateValue: v.dateValue ? new Date(v.dateValue) : null,
        })),
      });

      return context.json({ success: true });
    },
  );
}

function setupDeleteTransactionCustomPropertyRoute({ app, db, config }: RouteDefinitionContext) {
  app.delete(
    '/api/organizations/:organizationId/finances/transactions/:transactionId/custom-properties/:propertyDefinitionId',
    requireAuthentication(),
    requireFeatureFlag({ flagId: 'llc_finances', db }),
    legacyValidateParams(z.object({
      organizationId: organizationIdSchema,
      transactionId: z.string(),
      propertyDefinitionId: z.string(),
    })),
    async (context) => {
      const { userId } = getUser({ context });
      const { organizationId, transactionId, propertyDefinitionId } = context.req.valid('param');

      const organizationsRepository = createOrganizationsRepository({ db });
      await ensureUserIsInOrganization({ userId, organizationId, organizationsRepository });

      const financesRepository = createFinancesRepository({ db, authSecret: config.auth.secret });
      await financesRepository.getTransactionById({ transactionId, organizationId });

      const customPropertiesRepository = createCustomPropertiesRepository({ db });
      await customPropertiesRepository.deleteTransactionCustomPropertyValue({ transactionId, propertyDefinitionId });

      return context.body(null, 204);
    },
  );
}
