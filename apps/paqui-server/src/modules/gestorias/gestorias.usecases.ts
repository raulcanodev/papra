import type { Config } from '../config/config.types';
import type { EmailsServices } from '../emails/emails.services';
import type { UsersRepository } from '../users/users.repository';
import type { GestoriasRepository } from './gestorias.repository';
import type { GestoriaModule } from './gestorias.types';
import { buildUrl } from '@corentinth/chisels';
import { getClientBaseUrl } from '../config/config.models';
import { addDays } from '../shared/date';
import { sanitize } from '../shared/html/html';
import { GESTORIA_INVITATION_EXPIRATION_DELAY_DAYS } from './gestorias.constants';
import { createGestoriaClientAccessDeniedError, createGestoriaNotFoundError, createUserNotInGestoriaError } from './gestorias.errors';
import { hasGestoriaModule } from './gestorias.models';

export async function ensureUserIsInGestoria({
  userId,
  gestoriaId,
  gestoriasRepository,
}: {
  userId: string;
  gestoriaId: string;
  gestoriasRepository: GestoriasRepository;
}) {
  const { isInGestoria } = await gestoriasRepository.isUserInGestoria({ userId, gestoriaId });

  if (!isInGestoria) {
    throw createUserNotInGestoriaError();
  }
}

/**
 * The single gate of every read a gestoría makes on a company: the user is a member of the gestoría,
 * the company is one of its clients (and not deleted), and the admin granted the module.
 */
export async function ensureGestoriaCanReadClient({
  userId,
  gestoriaId,
  organizationId,
  module,
  gestoriasRepository,
}: {
  userId: string;
  gestoriaId: string;
  organizationId: string;
  module?: GestoriaModule;
  gestoriasRepository: GestoriasRepository;
}) {
  await ensureUserIsInGestoria({ userId, gestoriaId, gestoriasRepository });

  const { access } = await gestoriasRepository.getGestoriaClientAccess({ gestoriaId, organizationId });

  if (!access || (module && !hasGestoriaModule({ modules: access.modules, module }))) {
    throw createGestoriaClientAccessDeniedError();
  }

  return { access };
}

/**
 * Adds someone to a gestoría from the back office: right away when they already have an account,
 * otherwise by email, and they become a member when they sign up with that address.
 */
export async function addOrInviteGestoriaMember({
  gestoriaId,
  email,
  inviterId,
  gestoriasRepository,
  usersRepository,
  emailsServices,
  config,
  now = new Date(),
}: {
  gestoriaId: string;
  email: string;
  inviterId: string;
  gestoriasRepository: GestoriasRepository;
  usersRepository: UsersRepository;
  emailsServices: EmailsServices;
  config: Config;
  now?: Date;
}) {
  const { gestoria } = await gestoriasRepository.getGestoriaById({ gestoriaId });

  if (!gestoria) {
    throw createGestoriaNotFoundError();
  }

  const { user } = await usersRepository.getUserByEmail({ email });

  if (user) {
    const { member } = await gestoriasRepository.addGestoriaMember({ gestoriaId, userId: user.id });

    return { member, invitation: null };
  }

  const { invitation } = await gestoriasRepository.saveGestoriaInvitation({
    gestoriaId,
    email,
    inviterId,
    expiresAt: addDays(now, GESTORIA_INVITATION_EXPIRATION_DELAY_DAYS),
    now,
  });

  await sendGestoriaInvitationEmail({ email, gestoriaName: gestoria.name, emailsServices, config });

  return { member: null, invitation };
}

export async function sendGestoriaInvitationEmail({
  email,
  gestoriaName,
  emailsServices,
  config,
}: {
  email: string;
  gestoriaName: string;
  emailsServices: EmailsServices;
  config: Config;
}) {
  const { clientBaseUrl } = getClientBaseUrl({ config });
  const registerLink = buildUrl({ baseUrl: clientBaseUrl, path: '/register' });

  await emailsServices.sendEmail({
    to: email,
    subject: `You are invited to join ${gestoriaName} on Paqui`,
    html: `
      <p>You are invited to join ${sanitize(gestoriaName)} on Paqui, to read the books of the companies it works with.</p>
      <p>Create your account at <a href="${registerLink}">${registerLink}</a> with this email address (${sanitize(email)}): you will have access as soon as you sign in.</p>
      <p>This invitation expires in ${GESTORIA_INVITATION_EXPIRATION_DELAY_DAYS} days. If you were not expecting it, you can ignore this email.</p>
      <p>Best regards,<br />The Paqui team</p>
    `,
  });
}

/** Run on the first requests of a signed in user, so someone invited by email lands on their gestoría */
export async function acceptPendingGestoriaInvitationsOfUser({
  userId,
  gestoriasRepository,
  usersRepository,
  now = new Date(),
}: {
  userId: string;
  gestoriasRepository: GestoriasRepository;
  usersRepository: UsersRepository;
  now?: Date;
}) {
  const { user } = await usersRepository.getUserByIdOrThrow({ userId });

  return gestoriasRepository.acceptPendingGestoriaInvitations({ userId, email: user.email.toLowerCase(), now });
}
