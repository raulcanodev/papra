import type { Database } from '../../app/database/database.types';
import { eq } from 'drizzle-orm';
import { sessionsTable } from '../../app/auth/auth.tables';
import { getPermissionsForRoles } from '../../roles/roles.methods';
import { createRolesRepository } from '../../roles/roles.repository';
import { createLogger } from '../../shared/logger/logger';
import { canImpersonate, isImpersonationSessionWithinDuration } from './impersonation.models';
import { createImpersonationsRepository } from './impersonation.repository';

const logger = createLogger({ namespace: 'impersonation' });

// Checked on every request made with an impersonation session: past its hour, or once the admin
// has lost the permission, the session is destroyed instead of being used
export async function ensureImpersonationSessionIsValid({
  db,
  session,
  now = new Date(),
}: {
  db: Database;
  session: { id: string; userId: string; impersonatedBy: string; createdAt: Date; expiresAt: Date };
  now?: Date;
}) {
  const isWithinDuration = isImpersonationSessionWithinDuration({ createdAt: session.createdAt, expiresAt: session.expiresAt, now });

  const { roles } = await createRolesRepository({ db }).getUserRoles({ userId: session.impersonatedBy });
  const { permissions } = getPermissionsForRoles({ roles });
  const isAdminStillAllowed = canImpersonate({ permissions });

  if (isWithinDuration && isAdminStillAllowed) {
    return { isValid: true };
  }

  logger.warn({ sessionId: session.id, adminUserId: session.impersonatedBy, targetUserId: session.userId, isWithinDuration, isAdminStillAllowed }, 'Impersonation session revoked');

  await db.delete(sessionsTable).where(eq(sessionsTable.id, session.id));
  await createImpersonationsRepository({ db }).recordImpersonationEnd({ sessionId: session.id, endedAt: now });

  return { isValid: false };
}
