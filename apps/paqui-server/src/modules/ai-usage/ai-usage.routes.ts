import type { RouteDefinitionContext } from '../app/server.types';
import { z } from 'zod';
import { AI_MODELS, AI_PROVIDER_LABELS, AI_PROVIDERS, findAiModel } from '../ai-assistant/ai-assistant.models';
import { getAiModelSelection, getConfiguredProviders, isAiConfigured } from '../ai-assistant/ai-assistant.providers';
import { createRoleMiddleware, requireAuthentication } from '../app/auth/auth.middleware';
import { getUser } from '../app/auth/auth.models';
import { PERMISSIONS } from '../roles/roles.constants';
import { createError } from '../shared/errors/errors';
import { legacyValidateJsonBody, legacyValidateQuery } from '../shared/validation/validation.legacy';
import { AI_REASONING_EFFORTS } from './ai-usage.constants';
import { createAiUsageRepository } from './ai-usage.repository';

export function registerAdminAiUsageRoutes(context: RouteDefinitionContext) {
  setupSettingsRoutes(context);
  setupUsageRoutes(context);
}

function setupSettingsRoutes({ app, db, config }: RouteDefinitionContext) {
  const { requirePermissions } = createRoleMiddleware({ db });
  const authorize = requirePermissions({ requiredPermissions: [PERMISSIONS.MANAGE_AI] });

  const getSettingsResponse = async () => {
    const configuredProviders = getConfiguredProviders(config.aiAssistant);
    const { settings } = await createAiUsageRepository({ db }).getSettings();

    return {
      // What every AI feature uses right now, and whether it comes from the admin panel or the environment
      current: isAiConfigured({ config }) ? await getAiModelSelection({ config, db }) : null,
      source: settings !== null && configuredProviders.includes(settings.provider as never) ? 'admin' : 'environment',
      providers: AI_PROVIDERS.map(provider => ({ id: provider, label: AI_PROVIDER_LABELS[provider], isConfigured: configuredProviders.includes(provider) })),
      models: AI_MODELS.map(({ id, provider, label, efforts, prices }) => ({ id, provider, label, efforts, prices })),
    };
  };

  app.get('/api/admin/ai/settings', requireAuthentication(), authorize, async context => context.json(await getSettingsResponse()));

  app.put(
    '/api/admin/ai/settings',
    requireAuthentication(),
    authorize,
    legacyValidateJsonBody(z.object({ model: z.string().trim().min(1), reasoningEffort: z.enum(AI_REASONING_EFFORTS).nullable() })),
    async (context) => {
      const { userId } = getUser({ context });
      const { model: modelId, reasoningEffort } = context.req.valid('json');
      const model = findAiModel({ modelId });

      if (!model || !getConfiguredProviders(config.aiAssistant).includes(model.provider)) {
        throw createError({ message: 'Unknown model, or its provider has no API key', code: 'ai.model_unavailable', statusCode: 400 });
      }

      await createAiUsageRepository({ db }).saveSettings({
        settings: { provider: model.provider, model: model.id, reasoningEffort: reasoningEffort !== null && model.efforts.includes(reasoningEffort) ? reasoningEffort : null },
        userId,
      });

      return context.json(await getSettingsResponse());
    },
  );
}

const usageQuerySchema = z.object({
  from: z.coerce.date(),
  to: z.coerce.date(),
  groupBy: z.enum(['feature', 'organization', 'user']).default('feature'),
  feature: z.string().trim().min(1).max(100).optional(),
  organizationId: z.string().trim().min(1).max(64).optional(),
});

function setupUsageRoutes({ app, db }: RouteDefinitionContext) {
  const { requirePermissions } = createRoleMiddleware({ db });

  app.get(
    '/api/admin/ai/usage',
    requireAuthentication(),
    requirePermissions({ requiredPermissions: [PERMISSIONS.VIEW_ANALYTICS] }),
    legacyValidateQuery(usageQuerySchema),
    async (context) => {
      const { from, to, groupBy, feature, organizationId } = context.req.valid('query');
      const repository = createAiUsageRepository({ db });
      const [{ rows }, { rows: providerRows }] = await Promise.all([
        repository.getUsageBreakdown({ from, to, groupBy, feature, organizationId }),
        repository.getProviderTotals({ from, to }),
      ]);

      // Every provider is listed, at zero when unused: the one paid in another period shows up when the dates change
      const providers = AI_PROVIDERS.map((provider) => {
        const models = providerRows.filter(row => row.provider === provider);
        return {
          provider,
          label: AI_PROVIDER_LABELS[provider],
          calls: models.reduce((total, row) => total + row.calls, 0),
          costUsdMicros: models.reduce((total, row) => total + row.costUsdMicros, 0),
          unpricedCalls: models.reduce((total, row) => total + row.unpricedCalls, 0),
          models: models.map(({ model, calls, costUsdMicros }) => ({ model, calls, costUsdMicros })).sort((a, b) => b.costUsdMicros - a.costUsdMicros),
        };
      });

      return context.json({ rows, providers });
    },
  );
}
