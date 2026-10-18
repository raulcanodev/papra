import type { RouteDefinitionContext } from '../app/server.types';
import { z } from 'zod';
import { requireAuthentication } from '../app/auth/auth.middleware';
import { getUser } from '../app/auth/auth.models';
import { toDueDateCalendarEvent } from '../due-dates/due-dates.models';
import { createDueDatesRepository } from '../due-dates/due-dates.repository';
import { createInvoicingRepository } from '../invoicing/invoicing.repository';
import { organizationIdSchema } from '../organizations/organization.schemas.legacy';
import { createOrganizationsRepository } from '../organizations/organizations.repository';
import { ensureUserIsInOrganization } from '../organizations/organizations.usecases';
import { legacyValidateParams, legacyValidateQuery } from '../shared/validation/validation.legacy';
import { fetchAeatEvents, generateSpanishHolidays } from './calendar.sources';

const calendarQuerySchema = z.object({
  year: z.coerce.number().int().min(2020).max(2100),
  locale: z.string().trim().min(2).max(20).default('es-ES'),
});

export function registerCalendarRoutes({ app, db }: RouteDefinitionContext) {
  app.get('/api/organizations/:organizationId/calendar', requireAuthentication({ apiKeyPermissions: ['calendar:read'] }), legacyValidateParams(z.object({ organizationId: organizationIdSchema })), legacyValidateQuery(calendarQuerySchema), async (context) => {
    const { organizationId } = context.req.valid('param');
    const { year, locale } = context.req.valid('query');
    const { userId } = getUser({ context });
    await ensureUserIsInOrganization({ userId, organizationId, organizationsRepository: createOrganizationsRepository({ db }) });

    const { profile } = await createInvoicingRepository({ db }).getFiscalProfile({ organizationId });
    const holidays = generateSpanishHolidays({ year, region: profile?.region, locale });
    const [aeat, { instalments }] = await Promise.all([
      fetchAeatEvents(year),
      // The organization own due dates, to pay and to collect, each one opening its invoice
      createDueDatesRepository({ db }).listInstalments({ organizationId, from: new Date(Date.UTC(year, 0, 1)), to: new Date(Date.UTC(year + 1, 0, 1)) }),
    ]);
    const dueDates = instalments.map(instalment => toDueDateCalendarEvent({ instalment }));

    return context.json({
      events: [...holidays.events, ...aeat.events, ...dueDates].sort((left, right) => left.date.localeCompare(right.date) || left.name.localeCompare(right.name, locale)),
      warnings: aeat.warnings,
      holidayRegion: profile?.region ?? null,
      holidaySubdivision: holidays.subdivision,
      updatedAt: new Date().toISOString(),
    });
  });
}
