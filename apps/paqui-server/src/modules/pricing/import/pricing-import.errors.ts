import { createErrorFactory } from '../../shared/errors/errors';

export const createPricingImportUnreadableError = createErrorFactory({
  code: 'pricing.import_unreadable',
  message: 'The file is not a readable spreadsheet (.xlsx or .csv)',
  statusCode: 422,
});
