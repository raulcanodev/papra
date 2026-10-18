import { createErrorFactory } from '../shared/errors/errors';

export const createDeliveryNoteNotFoundError = createErrorFactory({
  code: 'delivery_notes.not_found',
  message: 'Delivery note not found',
  statusCode: 404,
});

export const createDeliveryNoteInvoicedError = createErrorFactory({
  code: 'delivery_notes.invoiced',
  message: 'An invoiced delivery note cannot be changed: delete its draft invoice first',
  statusCode: 409,
});

export const createDeliveryNotesMixedCustomersError = createErrorFactory({
  code: 'delivery_notes.mixed_customers',
  message: 'The delivery notes of an invoice must all belong to the same customer',
  statusCode: 400,
});

export const createDeliveryNoteUnreadableError = createErrorFactory({
  code: 'delivery_notes.unreadable',
  message: 'This file cannot be read as a delivery note: send a photo or a PDF',
  statusCode: 400,
});

export const createDeliveryNoteReadingFailedError = createErrorFactory({
  code: 'delivery_notes.reading_failed',
  message: 'The delivery note could not be read automatically',
  statusCode: 422,
});

export const createDeliveryNoteProductNotFoundError = createErrorFactory({
  code: 'delivery_notes.product_not_found',
  message: 'A product of the delivery note does not exist',
  statusCode: 404,
});
