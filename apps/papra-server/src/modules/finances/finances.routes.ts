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
import { addBankConnection, syncBankTransactions } from './finances.usecases';
import { getBankProviderAdapter } from './providers/provider.registry';

export function registerFinancesRoutes(context: RouteDefinitionContext) {
  setupGetBankConnectionsRoute(context);
  setupCreateBankConnectionRoute(context);
  setupDeleteBankConnectionRoute(context);
  setupSyncBankConnectionRoute(context);
  setupGetTransactionsRoute(context);
  setupUpdateTransactionClassificationRoute(context);
  setupGetBankProviderAccountsRoute(context);
}

function setupGetBankConnectionsRoute({ app, db }: RouteDefinitionContext) {
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

      const financesRepository = createFinancesRepository({ db });
      const { bankConnections } = await financesRepository.getBankConnections({ organizationId });

      return context.json({ bankConnections });
    },
  );
}

function setupCreateBankConnectionRoute({ app, db }: RouteDefinitionContext) {
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

      const financesRepository = createFinancesRepository({ db });
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

function setupDeleteBankConnectionRoute({ app, db }: RouteDefinitionContext) {
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

      const financesRepository = createFinancesRepository({ db });
      await financesRepository.deleteBankConnection({ bankConnectionId, organizationId });

      return context.json({ success: true });
    },
  );
}

function setupSyncBankConnectionRoute({ app, db }: RouteDefinitionContext) {
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

      const financesRepository = createFinancesRepository({ db });
      const { insertedCount } = await syncBankTransactions({
        bankConnectionId,
        organizationId,
        financesRepository,
      });

      return context.json({ insertedCount });
    },
  );
}

function setupGetTransactionsRoute({ app, db }: RouteDefinitionContext) {
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

      const financesRepository = createFinancesRepository({ db });

      const [{ transactions }, { count: transactionsCount }] = await Promise.all([
        financesRepository.getTransactions({ organizationId, pageIndex, pageSize, bankConnectionId, classification }),
        financesRepository.getTransactionsCount({ organizationId, bankConnectionId, classification }),
      ]);

      return context.json({ transactions, transactionsCount });
    },
  );
}

function setupUpdateTransactionClassificationRoute({ app, db }: RouteDefinitionContext) {
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

      const financesRepository = createFinancesRepository({ db });
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
