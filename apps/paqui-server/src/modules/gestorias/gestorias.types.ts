import type { GESTORIA_INVITATION_STATUS_LIST, GESTORIA_MODULES_LIST } from './gestorias.constants';
import type { gestoriaClientsTable, gestoriaInvitationsTable, gestoriaMembersTable, gestoriasTable } from './gestorias.tables';

export type GestoriaModule = typeof GESTORIA_MODULES_LIST[number];
export type GestoriaInvitationStatus = typeof GESTORIA_INVITATION_STATUS_LIST[number];

export type Gestoria = typeof gestoriasTable.$inferSelect;
export type GestoriaMember = typeof gestoriaMembersTable.$inferSelect;
export type GestoriaClient = typeof gestoriaClientsTable.$inferSelect;
export type GestoriaInvitation = typeof gestoriaInvitationsTable.$inferSelect;
