import { apiClient } from '@/modules/shared/http/api-client';
import { queryClient } from '@/modules/shared/query/query-client';

export type Impersonation = {
  id: string;
  createdAt: string;
  adminUserId: string | null;
  targetUserId: string | null;
  adminEmail: string;
  targetEmail: string;
  reason: string;
  canWrite: boolean;
  ipAddress: string | null;
  userAgent: string | null;
  expiresAt: string;
  endedAt: string | null;
};

export async function startImpersonation({ userId, reason, canWrite }: { userId: string; reason: string; canWrite: boolean }) {
  await apiClient({
    method: 'POST',
    path: '/api/auth/impersonation/start',
    body: { userId, reason, canWrite },
  });

  // Nothing cached from the admin's own account may show inside the other one
  queryClient.clear();
  window.location.href = '/';
}

export async function stopImpersonation() {
  await apiClient({
    method: 'POST',
    path: '/api/auth/impersonation/stop',
    // better-auth parses the JSON body of every POST, an empty one fails
    body: {},
  }).catch(() => undefined);

  queryClient.clear();
  window.location.href = '/admin/users';
}
