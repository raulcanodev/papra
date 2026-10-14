import type { RouteDefinitionContext } from '../app/server.types';
import { z } from 'zod';
import { requireAuthentication } from '../app/auth/auth.middleware';
import { getUser } from '../app/auth/auth.models';
import { formatSenderAddress } from '../emails/emails.models';
import { organizationIdSchema } from '../organizations/organization.schemas.legacy';
import { createOrganizationsRepository } from '../organizations/organizations.repository';
import { ensureUserIsInOrganization } from '../organizations/organizations.usecases';
import { EXPENSE_CATEGORIES } from '../purchases/purchases.constants';
import { createError } from '../shared/errors/errors';
import { sanitize } from '../shared/html/html';
import { legacyValidateJsonBody, legacyValidateParams, legacyValidateQuery } from '../shared/validation/validation.legacy';
import { QUARTERS } from './taxes.constants';
import { buildAccountantPack, MAX_EMAILED_DOCUMENTS_SIZE_BYTES } from './taxes.export';
import { createTaxesRepository } from './taxes.repository';
import { buildQuarterlyTaxReport } from './taxes.usecases';

const periodParamsSchema = z.object({
  organizationId: organizationIdSchema,
  year: z.coerce.number().int().min(2000).max(2100),
  quarter: z.coerce.number().int().refine((value): value is typeof QUARTERS[number] => (QUARTERS as readonly number[]).includes(value), 'Quarter must be 1 to 4'),
});

// All the simulated purchase fields together, or none
const simulationQuerySchema = z.object({
  simulateBaseMinor: z.coerce.number().int().min(1).max(1_000_000_000).optional(),
  simulateTaxRateBps: z.coerce.number().int().min(0).max(10_000).optional(),
  simulateDeductibleRateBps: z.coerce.number().int().min(0).max(10_000).optional(),
  simulateCategory: z.enum(EXPENSE_CATEGORIES).optional(),
});

export function registerTaxesRoutes(context: RouteDefinitionContext) {
  setupGetQuarterlyTaxReportRoute(context);
  setupExportAccountantPackRoute(context);
  setupSendAccountantPackRoute(context);
}

function setupGetQuarterlyTaxReportRoute({ app, db }: RouteDefinitionContext) {
  app.get(
    '/api/organizations/:organizationId/taxes/:year/:quarter',
    requireAuthentication(),
    legacyValidateParams(periodParamsSchema),
    legacyValidateQuery(simulationQuerySchema),
    async (context) => {
      const { userId } = getUser({ context });
      const { organizationId, year, quarter } = context.req.valid('param');
      const { simulateBaseMinor, simulateTaxRateBps, simulateDeductibleRateBps, simulateCategory } = context.req.valid('query');

      await ensureUserIsInOrganization({ userId, organizationId, organizationsRepository: createOrganizationsRepository({ db }) });

      const { report } = await buildQuarterlyTaxReport({
        organizationId,
        year,
        quarter,
        simulatedPurchase: simulateBaseMinor === undefined
          ? undefined
          : { baseMinor: simulateBaseMinor, taxRateBps: simulateTaxRateBps ?? 2_100, deductibleRateBps: simulateDeductibleRateBps ?? 10_000, category: simulateCategory ?? 'other' },
        taxesRepository: createTaxesRepository({ db }),
      });

      return context.json({ report });
    },
  );
}

function setupExportAccountantPackRoute({ app, db, documentsStorageService }: RouteDefinitionContext) {
  app.get(
    '/api/organizations/:organizationId/taxes/:year/:quarter/export',
    requireAuthentication(),
    legacyValidateParams(periodParamsSchema),
    async (context) => {
      const { userId } = getUser({ context });
      const { organizationId, year, quarter } = context.req.valid('param');
      const organizationsRepository = createOrganizationsRepository({ db });

      await ensureUserIsInOrganization({ userId, organizationId, organizationsRepository });

      const { organization } = await organizationsRepository.getOrganizationById({ organizationId });
      const data = await buildQuarterlyTaxReport({ organizationId, year, quarter, taxesRepository: createTaxesRepository({ db }) });
      const { content, fileName } = await buildAccountantPack({ data, organizationName: organization?.name ?? '', organizationId, db, documentsStorageService });

      return context.body(new Uint8Array(content), 200, {
        'Content-Type': 'application/zip',
        'Content-Disposition': `attachment; filename="${fileName}"`,
        'Content-Length': String(content.byteLength),
        'Cache-Control': 'private, no-store',
      });
    },
  );
}

function setupSendAccountantPackRoute({ app, db, config, documentsStorageService, emailsServices }: RouteDefinitionContext) {
  app.post(
    '/api/organizations/:organizationId/taxes/:year/:quarter/send',
    requireAuthentication(),
    legacyValidateParams(periodParamsSchema),
    legacyValidateJsonBody(z.object({ to: z.string().trim().email().optional() })),
    async (context) => {
      const { userId } = getUser({ context });
      const { organizationId, year, quarter } = context.req.valid('param');
      const { to } = context.req.valid('json');
      const organizationsRepository = createOrganizationsRepository({ db });
      const taxesRepository = createTaxesRepository({ db });

      await ensureUserIsInOrganization({ userId, organizationId, organizationsRepository });

      const [{ organization }, { profile }] = await Promise.all([
        organizationsRepository.getOrganizationById({ organizationId }),
        taxesRepository.getTaxProfile({ organizationId }),
      ]);

      const recipient = to ?? profile?.accountantEmail ?? null;

      if (recipient === null) {
        throw createError({ message: 'No accountant email is set.', code: 'taxes.accountant_email_required', statusCode: 400 });
      }

      const data = await buildQuarterlyTaxReport({ organizationId, year, quarter, taxesRepository });
      const organizationName = [profile?.legalName, organization?.name].find(name => (name ?? '').trim() !== '') ?? '';
      const { content, fileName, skippedDocumentsCount } = await buildAccountantPack({ data, organizationName, organizationId, db, documentsStorageService, maxDocumentsSizeBytes: MAX_EMAILED_DOCUMENTS_SIZE_BYTES });

      const replyTo = profile?.email?.trim();

      await emailsServices.sendEmail({
        // Sent as the organization, the accountant replies to it
        from: formatSenderAddress({ fromEmail: config.emails.fromEmail, displayName: organizationName }),
        replyTo: replyTo === undefined || replyTo === '' ? undefined : replyTo,
        to: recipient,
        subject: `Documentación ${quarter}T ${year} - ${organizationName}`,
        html: [
          '<p>Hola,</p>',
          `<p>Te adjunto la documentación del ${quarter}º trimestre de ${year} de <strong>${sanitize(organizationName)}</strong>: libros registro de facturas emitidas y recibidas, resumen y facturas.</p>`,
          skippedDocumentsCount > 0 ? `<p>${skippedDocumentsCount} facturas no caben en el email, están disponibles en la descarga desde Paqui.</p>` : '',
          '<p>Un saludo.</p>',
        ].join(''),
        attachments: [{ filename: fileName, content, contentType: 'application/zip' }],
      });

      return context.json({ recipient, skippedDocumentsCount });
    },
  );
}
