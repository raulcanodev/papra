import type { AsDto } from '../shared/http/http-client.types';
import type { IntakeEmail, IntakeEmailDelivery } from './intake-emails.types';
import { apiClient } from '../shared/http/api-client';
import { coerceDates } from '../shared/http/http-client.models';

export async function fetchIntakeEmails({ organizationId }: { organizationId: string }) {
  const { intakeEmails, deliveries, domain } = await apiClient<{ intakeEmails: AsDto<IntakeEmail>[]; deliveries: AsDto<IntakeEmailDelivery>[]; domain: string | null }>({
    path: `/api/organizations/${organizationId}/intake-emails`,
    method: 'GET',
  });

  return {
    intakeEmails: intakeEmails.map(coerceDates),
    deliveries: deliveries.map(coerceDates),
    domain,
  };
}

export async function createIntakeEmail({ organizationId, alias }: { organizationId: string; alias: string }) {
  const { intakeEmail } = await apiClient<{ intakeEmail: AsDto<IntakeEmail> }>({
    path: `/api/organizations/${organizationId}/intake-emails`,
    method: 'POST',
    body: { alias },
  });

  return {
    intakeEmail: coerceDates(intakeEmail),
  };
}

export async function deleteIntakeEmail({ organizationId, intakeEmailId }: { organizationId: string; intakeEmailId: string }) {
  await apiClient({
    path: `/api/organizations/${organizationId}/intake-emails/${intakeEmailId}`,
    method: 'DELETE',
  });
}

export async function updateIntakeEmail({
  organizationId,
  intakeEmailId,
  isEnabled,
  allowedOrigins,
}: {
  organizationId: string;
  intakeEmailId: string;
  isEnabled?: boolean;
  allowedOrigins?: string[];
}) {
  const { intakeEmail } = await apiClient<{ intakeEmail: AsDto<IntakeEmail> }>({
    path: `/api/organizations/${organizationId}/intake-emails/${intakeEmailId}`,
    method: 'PUT',
    body: {
      isEnabled,
      allowedOrigins,
    },
  });

  return {
    intakeEmail: coerceDates(intakeEmail),
  };
}
