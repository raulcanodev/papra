import { createPrefixedIdRegex } from '../shared/random/ids';

export const GESTORIA_ID_PREFIX = 'gst';
export const GESTORIA_ID_REGEX = createPrefixedIdRegex({ prefix: GESTORIA_ID_PREFIX });

export const GESTORIA_MEMBER_ID_PREFIX = 'gst_mem';
export const GESTORIA_MEMBER_ID_REGEX = createPrefixedIdRegex({ prefix: GESTORIA_MEMBER_ID_PREFIX });

export const GESTORIA_CLIENT_ID_PREFIX = 'gst_cli';

export const GESTORIA_INVITATION_ID_PREFIX = 'gst_inv';
export const GESTORIA_INVITATION_ID_REGEX = createPrefixedIdRegex({ prefix: GESTORIA_INVITATION_ID_PREFIX });

export const GESTORIA_INVITATION_STATUS = {
  PENDING: 'pending',
  ACCEPTED: 'accepted',
} as const;

export const GESTORIA_INVITATION_STATUS_LIST = Object.values(GESTORIA_INVITATION_STATUS);

// Past this delay the link in the email no longer gives access, the admin invites the person again
export const GESTORIA_INVITATION_EXPIRATION_DELAY_DAYS = 14;

// What a gestoría can read of a client company, granted one by one by an admin. A new module is a new entry here,
// its read-only routes in ./modules/<module> and its pages in the client gestorías module
export const GESTORIA_MODULES = {
  // Invoices issued by the company (drafts excluded: only what is already on the books)
  INVOICES: 'invoices',
  // Invoices received from suppliers, with the attached file
  PURCHASES: 'purchases',
  // Quarterly tax estimation and the documentation pack of the quarter
  TAXES: 'taxes',
} as const;

export const GESTORIA_MODULES_LIST = Object.values(GESTORIA_MODULES);
