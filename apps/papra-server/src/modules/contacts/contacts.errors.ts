import { createErrorFactory } from '../shared/errors/errors';

export const createContactNotFoundError = createErrorFactory({
  message: 'Contact not found.',
  code: 'contact.not_found',
  statusCode: 404,
});

export const createContactRoleRequiredError = createErrorFactory({
  message: 'The contact does not have the role required for this operation.',
  code: 'contact.role_required',
  statusCode: 400,
});
