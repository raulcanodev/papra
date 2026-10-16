import { createErrorFactory } from '../shared/errors/errors';

export const createProductCatalogScanFailedError = createErrorFactory({
  message: 'The catalog could not be read automatically.',
  code: 'product_catalog.scan_failed',
  statusCode: 422,
});

export const createProductCatalogUnreadableError = createErrorFactory({
  message: 'None of the files could be read.',
  code: 'product_catalog.unreadable',
  statusCode: 400,
});
