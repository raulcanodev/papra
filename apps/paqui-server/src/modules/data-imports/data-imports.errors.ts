import { createErrorFactory } from '../shared/errors/errors';

export const createDataImportUnreadableError = createErrorFactory({
  code: 'data_import.unreadable',
  message: 'The file is not a readable spreadsheet (.xlsx or .csv)',
  statusCode: 422,
});

export const createDataImportEmptyError = createErrorFactory({
  code: 'data_import.empty',
  message: 'The file has no rows to import',
  statusCode: 422,
});
