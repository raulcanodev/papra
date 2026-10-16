import type { CalendarFeed } from './calendar.types';
import { apiClient } from '@/modules/shared/http/api-client';

export function fetchCalendarFeed({ organizationId, year, locale }: { organizationId: string; year: number; locale: string }) {
  const search = new URLSearchParams({ year: String(year), locale });
  return apiClient<CalendarFeed>({ path: `/api/organizations/${organizationId}/calendar?${search}`, method: 'GET' });
}
