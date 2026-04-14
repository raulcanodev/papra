import type { RouteDefinitionContext } from '../app/server.types';
import { z } from 'zod';
import { requireAuthentication } from '../app/auth/auth.middleware';
import { getUser } from '../app/auth/auth.models';
import { requireFeatureFlag } from '../feature-flags/feature-flags.middleware';
import { organizationIdSchema } from '../organizations/organization.schemas.legacy';
import { createOrganizationsRepository } from '../organizations/organizations.repository';
import { ensureUserIsInOrganization } from '../organizations/organizations.usecases';
import { legacyValidateJsonBody, legacyValidateParams, legacyValidateQuery } from '../shared/validation/validation.legacy';
import { BANK_PROVIDERS, TRANSACTION_CLASSIFICATIONS } from './finances.constants';
import { createFinancesRepository } from './finances.repository';
import { addBankConnection, autoClassifyTransactions, syncBankTransactions } from './finances.usecases';
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
    async (context) => {
      const { userId } = getUser({ context });
      const { organizationId, bankConnectionId } = context.req.valid('param');

      const organizationsRepository = createOrganizationsRepository({ db });
      await ensureUserIsInOrganization({ userId, organizationId, organizationsRepository });

      const financesRepository = createFinancesRepository({ db, authSecret: config.auth.secret });
      const { insertedCount } = await syncBankTransactions({
        bankConnectionId,
        organizationId,
        financesRepository,
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
      field: z.enum(RULE_FIELDS),
      operator: z.enum(RULE_OPERATORS),
      value: z.string().min(1),
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
      field: z.enum(RULE_FIELDS).optional(),
      operator: z.enum(RULE_OPERATORS).optional(),
      value: z.string().min(1).optional(),
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
      const { classifiedCount } = await autoClassifyTransactions({ organizationId, financesRepository });

      return context.json({ classifiedCount });
    },
  );
}
