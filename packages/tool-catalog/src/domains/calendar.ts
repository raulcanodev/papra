import { z } from 'zod';
import { API_KEY_PERMISSIONS } from '../permissions';
import { organizationPath, withQuery } from '../request';
import { defineOrganizationTool } from '../tool-definition';

export const calendarTools = [
  defineOrganizationTool({
    name: 'get_calendar',
    title: 'Get calendar',
    description: 'Read the fiscal calendar of the organization for a year: Spanish tax filing deadlines published by the AEAT (fetched live, so they are current) and the public holidays of the region set in the fiscal profile. Each event has a date and a name. Use it to answer "when is the next deadline" or "what do I have to file this month", and cross-check it with get_quarterly_taxes. `warnings` lists the sources that could not be reached.',
    risk: 'read',
    permission: API_KEY_PERMISSIONS.CALENDAR.READ,
    input: {
      year: z.number().int().min(2020).max(2100),
      locale: z.string().trim().min(2).max(20).default('es-ES').describe('Language of the event names'),
    },
    run: ({ year, locale }, { api, organizationId }) => api.request('GET', withQuery(organizationPath(organizationId, '/calendar'), { year, locale })),
  }),
];
