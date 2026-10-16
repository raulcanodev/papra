import { createErrorFactory } from '../shared/errors/errors';

export const createBankConnectionNotFoundError = createErrorFactory({
  message: 'Bank connection not found',
  code: 'finances.bank_connection_not_found',
  statusCode: 404,
});

export const createBankConnectionAlreadyExistsError = createErrorFactory({
  message: 'A bank connection with this provider and account already exists',
  code: 'finances.bank_connection_already_exists',
  statusCode: 409,
});

export const createTransactionNotFoundError = createErrorFactory({
  message: 'Transaction not found',
  code: 'finances.transaction_not_found',
  statusCode: 404,
});

export const createBankSyncError = createErrorFactory({
  message: 'Failed to sync transactions from bank provider',
  code: 'finances.bank_sync_error',
  statusCode: 502,
});
