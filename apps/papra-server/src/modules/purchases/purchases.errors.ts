import { createErrorFactory } from '../shared/errors/errors';

export const createPurchaseInvoiceNotFoundError = createErrorFactory({
  message: 'Purchase invoice not found.',
  code: 'purchase_invoice.not_found',
  statusCode: 404,
});

export const createPurchaseInvoiceAlreadyExistsError = createErrorFactory({
  message: 'An invoice with this number from this supplier is already registered.',
  code: 'purchase_invoice.already_exists',
  statusCode: 409,
});

export const createPurchaseDocumentNotExtractableError = createErrorFactory({
  message: 'This document cannot be read automatically, only PDF and image files up to 10 MB are supported.',
  code: 'purchase_invoice.document_not_extractable',
  statusCode: 400,
});

export const createPurchaseExtractionFailedError = createErrorFactory({
  message: 'The invoice could not be read automatically, please fill it in manually.',
  code: 'purchase_invoice.extraction_failed',
  statusCode: 422,
});
