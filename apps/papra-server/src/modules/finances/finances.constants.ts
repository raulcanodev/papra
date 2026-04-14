import { createPrefixedIdRegex } from '../shared/random/ids';

export const BANK_CONNECTION_ID_PREFIX = 'bnk';
export const BANK_CONNECTION_ID_REGEX = createPrefixedIdRegex({ prefix: BANK_CONNECTION_ID_PREFIX });

export const TRANSACTION_ID_PREFIX = 'txn';
export const TRANSACTION_ID_REGEX = createPrefixedIdRegex({ prefix: TRANSACTION_ID_PREFIX });

export const CLASSIFICATION_RULE_ID_PREFIX = 'clr';
export const CLASSIFICATION_RULE_ID_REGEX = createPrefixedIdRegex({ prefix: CLASSIFICATION_RULE_ID_PREFIX });

export const TRANSACTION_CLASSIFICATIONS = ['expense', 'income', 'owner_transfer'] as const;
export type TransactionClassification = typeof TRANSACTION_CLASSIFICATIONS[number];

export const BANK_PROVIDERS = ['mercury', 'wise'] as const;
export type BankProvider = typeof BANK_PROVIDERS[number];
