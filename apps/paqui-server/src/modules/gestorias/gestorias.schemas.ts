import type { NonEmptyArray } from '../shared/types';
import type { GestoriaModule } from './gestorias.types';
import { z } from 'zod';
import { organizationIdSchema } from '../organizations/organization.schemas.legacy';
import { GESTORIA_ID_REGEX, GESTORIA_INVITATION_ID_REGEX, GESTORIA_MEMBER_ID_REGEX, GESTORIA_MODULES_LIST } from './gestorias.constants';

export const gestoriaIdSchema = z.string().regex(GESTORIA_ID_REGEX);
export const gestoriaMemberIdSchema = z.string().regex(GESTORIA_MEMBER_ID_REGEX);
export const gestoriaInvitationIdSchema = z.string().regex(GESTORIA_INVITATION_ID_REGEX);

export const gestoriaParamsSchema = z.object({ gestoriaId: gestoriaIdSchema });
export const gestoriaClientParamsSchema = z.object({ gestoriaId: gestoriaIdSchema, organizationId: organizationIdSchema });

export const gestoriaModulesSchema = z.array(z.enum(GESTORIA_MODULES_LIST as NonEmptyArray<GestoriaModule>)).max(GESTORIA_MODULES_LIST.length);

const optionalTextSchema = z.string().trim().max(255).nullable().optional().transform(value => (value === '' ? null : value));

export const gestoriaBodySchema = z.object({
  name: z.string().trim().min(1).max(255),
  taxId: optionalTextSchema,
  email: z.string().trim().email().max(255).nullable().optional().or(z.literal('').transform(() => null)),
});
