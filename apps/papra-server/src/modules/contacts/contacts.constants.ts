export const CONTACT_ID_PREFIX = 'ctc';

export const CONTACT_KINDS = ['company', 'person'] as const;
export type ContactKind = typeof CONTACT_KINDS[number];

// A contact can hold several roles at once (a customer that is also a supplier...), or none (a plain address book entry)
export const CONTACT_ROLES = ['customer', 'supplier', 'sales_representative'] as const;
export type ContactRole = typeof CONTACT_ROLES[number];
