import { createErrorFactory } from '../shared/errors/errors';

export const createInstalmentNotFoundError = createErrorFactory({
  message: 'Due date not found.',
  code: 'payment_instalment.not_found',
  statusCode: 404,
});
