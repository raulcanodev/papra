import type { RouteDefinitionContext } from '../../../app/server.types';
import { z } from 'zod';
import { requireAuthentication } from '../../../app/auth/auth.middleware';
import { getUser } from '../../../app/auth/auth.models';
import { legacyValidateParams } from '../../../shared/validation/validation.legacy';
import { QUARTERS } from '../../../taxes/taxes.constants';
import { buildAccountantPack } from '../../../taxes/taxes.export';
import { createTaxesRepository } from '../../../taxes/taxes.repository';
import { buildQuarterlyTaxReport } from '../../../taxes/taxes.usecases';
import { GESTORIA_MODULES } from '../../gestorias.constants';
import { createGestoriasRepository } from '../../gestorias.repository';
import { gestoriaClientParamsSchema } from '../../gestorias.schemas';
import { ensureGestoriaCanReadClient } from '../../gestorias.usecases';

const periodParamsSchema = gestoriaClientParamsSchema.extend({
  year: z.coerce.number().int().min(2000).max(2100),
  quarter: z.coerce.number().int().refine((value): value is typeof QUARTERS[number] => (QUARTERS as readonly number[]).includes(value), 'Quarter must be 1 to 4'),
});

// The quarter of a client company: the same estimation and documentation pack its members see, without having to send it
export function registerGestoriaTaxesRoutes(context: RouteDefinitionContext) {
  setupGetClientQuarterlyTaxReportRoute(context);
  setupExportClientAccountantPackRoute(context);
}

function setupGetClientQuarterlyTaxReportRoute({ app, db }: RouteDefinitionContext) {
  app.get(
    '/api/gestorias/:gestoriaId/clients/:organizationId/taxes/:year/:quarter',
    requireAuthentication(),
    legacyValidateParams(periodParamsSchema),
    async (context) => {
      const { userId } = getUser({ context });
      const { gestoriaId, organizationId, year, quarter } = context.req.valid('param');

      await ensureGestoriaCanReadClient({ userId, gestoriaId, organizationId, module: GESTORIA_MODULES.TAXES, gestoriasRepository: createGestoriasRepository({ db }) });

      const { report } = await buildQuarterlyTaxReport({ organizationId, year, quarter, taxesRepository: createTaxesRepository({ db }) });

      return context.json({ report });
    },
  );
}

function setupExportClientAccountantPackRoute({ app, db, documentsStorageService }: RouteDefinitionContext) {
  app.get(
    '/api/gestorias/:gestoriaId/clients/:organizationId/taxes/:year/:quarter/export',
    requireAuthentication(),
    legacyValidateParams(periodParamsSchema),
    async (context) => {
      const { userId } = getUser({ context });
      const { gestoriaId, organizationId, year, quarter } = context.req.valid('param');

      const { access } = await ensureGestoriaCanReadClient({ userId, gestoriaId, organizationId, module: GESTORIA_MODULES.TAXES, gestoriasRepository: createGestoriasRepository({ db }) });

      const data = await buildQuarterlyTaxReport({ organizationId, year, quarter, taxesRepository: createTaxesRepository({ db }) });
      const { content, fileName } = await buildAccountantPack({ data, organizationName: access.organizationName, organizationId, db, documentsStorageService });

      return context.body(new Uint8Array(content), 200, {
        'Content-Type': 'application/zip',
        'Content-Disposition': `attachment; filename="${fileName}"`,
        'Content-Length': String(content.byteLength),
        'Cache-Control': 'private, no-store',
      });
    },
  );
}
