export const INVOICE_ID_PREFIX = 'inv';
export const INVOICE_ITEM_ID_PREFIX = 'invit';
export const INVOICE_SERIES_ID_PREFIX = 'isr';
export const INVOICE_EVENT_ID_PREFIX = 'inev';
export const PRODUCT_ID_PREFIX = 'prd';
export const TAX_RATE_ID_PREFIX = 'tax';
export const VERIFACTU_RECORD_ID_PREFIX = 'vfr';
export const VERIFACTU_ATTEMPT_ID_PREFIX = 'vfa';

export const INVOICE_STATUSES = ['draft', 'issuing', 'issued', 'sent', 'paid', 'void'] as const;
export type InvoiceStatus = typeof INVOICE_STATUSES[number];

export const INVOICE_TEMPLATE_IDS = ['minimal', 'classic'] as const;
export type InvoiceTemplateId = typeof INVOICE_TEMPLATE_IDS[number];

export const VERIFACTU_MODES = ['disabled', 'test', 'production', 'not_applicable'] as const;
export const VERIFACTU_RECORD_STATUSES = ['pending', 'sending', 'accepted', 'accepted_with_errors', 'rejected', 'retrying', 'cancelled'] as const;
