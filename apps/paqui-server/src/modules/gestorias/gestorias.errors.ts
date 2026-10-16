import { createErrorFactory } from '../shared/errors/errors';

export const createGestoriaNotFoundError = createErrorFactory({
  message: 'Gestoría not found.',
  code: 'gestoria.not_found',
  statusCode: 404,
});

// Same answer whether the gestoría does not exist or the user is not part of it, so ids cannot be probed
export const createUserNotInGestoriaError = createErrorFactory({
  message: 'You are not part of this gestoría.',
  code: 'gestoria.user_not_member',
  statusCode: 403,
});

// Same answer whether the company does not exist, is not a client or the module was not granted
export const createGestoriaClientAccessDeniedError = createErrorFactory({
  message: 'This gestoría has no access to this company.',
  code: 'gestoria.client_access_denied',
  statusCode: 403,
});

export const createGestoriaMemberAlreadyExistsError = createErrorFactory({
  message: 'This user is already a member of the gestoría.',
  code: 'gestoria.member_already_exists',
  statusCode: 409,
});

export const createGestoriaMemberNotFoundError = createErrorFactory({
  message: 'Gestoría member not found.',
  code: 'gestoria.member_not_found',
  statusCode: 404,
});

export const createGestoriaInvitationNotFoundError = createErrorFactory({
  message: 'Gestoría invitation not found.',
  code: 'gestoria.invitation_not_found',
  statusCode: 404,
});

export const createGestoriaClientAlreadyExistsError = createErrorFactory({
  message: 'This company is already a client of the gestoría.',
  code: 'gestoria.client_already_exists',
  statusCode: 409,
});

export const createGestoriaClientNotFoundError = createErrorFactory({
  message: 'This company is not a client of the gestoría.',
  code: 'gestoria.client_not_found',
  statusCode: 404,
});
