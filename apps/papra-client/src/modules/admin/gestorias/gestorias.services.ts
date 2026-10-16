import type { GestoriaModule } from '@/modules/gestorias/gestorias.types';
import { apiClient } from '@/modules/shared/http/api-client';

export type AdminGestoria = {
  id: string;
  name: string;
  taxId: string | null;
  email: string | null;
  createdAt: string;
  updatedAt: string;
};

export type AdminGestoriaListItem = AdminGestoria & { memberCount: number; clientCount: number };

export type AdminGestoriaMember = {
  id: string;
  userId: string;
  name: string | null;
  email: string;
  createdAt: string;
};

// Someone invited by email who has not signed up yet
export type AdminGestoriaInvitation = {
  id: string;
  email: string;
  expiresAt: string;
  createdAt: string;
  updatedAt: string;
};

export type AdminGestoriaClient = {
  id: string;
  organizationId: string;
  name: string;
  legalName: string | null;
  taxId: string | null;
  modules: GestoriaModule[];
  isDeleted: boolean;
  createdAt: string;
};

export type GestoriaInput = { name: string; taxId: string | null; email: string | null };

const basePath = '/api/admin/gestorias';

export async function listGestorias({ search }: { search?: string } = {}) {
  return apiClient<{ gestorias: AdminGestoriaListItem[] }>({ method: 'GET', path: basePath, query: { search } });
}

export async function createGestoria({ gestoria }: { gestoria: GestoriaInput }) {
  return apiClient<{ gestoria: AdminGestoria }>({ method: 'POST', path: basePath, body: gestoria });
}

export async function getGestoria({ gestoriaId }: { gestoriaId: string }) {
  return apiClient<{ gestoria: AdminGestoria; members: AdminGestoriaMember[]; invitations: AdminGestoriaInvitation[]; clients: AdminGestoriaClient[] }>({ method: 'GET', path: `${basePath}/${gestoriaId}` });
}

export async function updateGestoria({ gestoriaId, gestoria }: { gestoriaId: string; gestoria: GestoriaInput }) {
  return apiClient<{ gestoria: AdminGestoria }>({ method: 'PUT', path: `${basePath}/${gestoriaId}`, body: gestoria });
}

export async function deleteGestoria({ gestoriaId }: { gestoriaId: string }) {
  await apiClient({ method: 'DELETE', path: `${basePath}/${gestoriaId}` });
}

export async function addGestoriaMember({ gestoriaId, email }: { gestoriaId: string; email: string }) {
  // A member when the person already has an account, an invitation sent by email otherwise
  return apiClient<{ member: { id: string } | null; invitation: AdminGestoriaInvitation | null }>({ method: 'POST', path: `${basePath}/${gestoriaId}/members`, body: { email } });
}

export async function cancelGestoriaInvitation({ gestoriaId, invitationId }: { gestoriaId: string; invitationId: string }) {
  await apiClient({ method: 'DELETE', path: `${basePath}/${gestoriaId}/invitations/${invitationId}` });
}

export async function removeGestoriaMember({ gestoriaId, memberId }: { gestoriaId: string; memberId: string }) {
  await apiClient({ method: 'DELETE', path: `${basePath}/${gestoriaId}/members/${memberId}` });
}

export async function addGestoriaClient({ gestoriaId, organizationId, modules }: { gestoriaId: string; organizationId: string; modules: GestoriaModule[] }) {
  return apiClient<{ client: { id: string } }>({ method: 'POST', path: `${basePath}/${gestoriaId}/clients`, body: { organizationId, modules } });
}

export async function updateGestoriaClientModules({ gestoriaId, organizationId, modules }: { gestoriaId: string; organizationId: string; modules: GestoriaModule[] }) {
  return apiClient<{ client: { id: string } }>({ method: 'PUT', path: `${basePath}/${gestoriaId}/clients/${organizationId}`, body: { modules } });
}

export async function removeGestoriaClient({ gestoriaId, organizationId }: { gestoriaId: string; organizationId: string }) {
  await apiClient({ method: 'DELETE', path: `${basePath}/${gestoriaId}/clients/${organizationId}` });
}

export async function getOrganizationGestorias({ organizationId }: { organizationId: string }) {
  return apiClient<{ gestorias: { id: string; name: string; modules: GestoriaModule[]; createdAt: string }[] }>({ method: 'GET', path: `/api/admin/organizations/${organizationId}/gestorias` });
}
