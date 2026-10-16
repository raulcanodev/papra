import { createErrorFactory } from '../shared/errors/errors';

export const createFiscalProfileRequiredError = createErrorFactory({
  code: 'invoicing.fiscal_profile_required',
  message: 'Complete the fiscal profile before issuing an invoice',
  statusCode: 409,
});

export const createInvoiceNotFoundError = createErrorFactory({
  code: 'invoicing.invoice_not_found',
  message: 'Invoice not found',
  statusCode: 404,
});

export const createInvoiceNotEditableError = createErrorFactory({
  code: 'invoicing.invoice_not_editable',
  message: 'Only draft invoices can be edited',
  statusCode: 409,
});

export const createInvoiceNotIssuableError = createErrorFactory({
  code: 'invoicing.invoice_not_issuable',
  message: 'This invoice cannot be issued',
  statusCode: 409,
});

export const createInvoiceEmailRequiredError = createErrorFactory({
  code: 'invoicing.customer_email_required',
  message: 'The customer needs an email address before sending the invoice',
  statusCode: 409,
});

export const createVerifactuConfigurationIncompleteError = createErrorFactory({
  code: 'verifactu.configuration_incomplete',
  message: 'VERI*FACTU production activation requires a tax ID, configured certificate, passed AEAT validation and accepted responsible declaration',
  statusCode: 409,
});

export const createVerifactuModeLockedError = createErrorFactory({
  code: 'verifactu.mode_locked',
  message: 'VERI*FACTU production mode cannot be disabled before the end of the calendar year',
  statusCode: 409,
});
