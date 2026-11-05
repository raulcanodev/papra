import type { UserMe } from './users.types';
import { apiClient } from '../shared/http/api-client';

export async function fetchCurrentUser() {
  const { user } = await apiClient<{ user: UserMe }>({
    path: '/api/users/me',
    method: 'GET',
  });

  return { user };
}

export async function updateUser({ name, phone }: { name: string; phone?: string | null }) {
  const { user } = await apiClient<{ user: UserMe }>({
    path: '/api/users/me',
    method: 'PUT',
    body: { name, phone },
  });

  return { user };
}

export async function markChangelogSeen({ entryId }: { entryId: string }) {
  await apiClient({
    path: '/api/users/me/changelog-seen',
    method: 'PUT',
    body: { entryId },
  });
}

export async function setPassword({ newPassword }: { newPassword: string }) {
  await apiClient({
    path: '/api/users/me/password',
    method: 'POST',
    body: { newPassword },
  });
}
