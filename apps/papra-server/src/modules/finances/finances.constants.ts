import { createPrefixedIdRegex } from '../shared/random/ids';

export const BANK_CONNECTION_ID_PREFIX = 'bnk';
export const BANK_CONNECTION_ID_REGEX = createPrefixedIdRegex({ prefix: BANK_CONNECTION_ID_PREFIX });

export const TRANSACTION_ID_PREFIX = 'txn';
export const TRANSACTION_ID_REGEX = createPrefixedIdRegex({ prefix: TRANSACTION_ID_PREFIX });

export const CLASSIFICATION_RULE_ID_PREFIX = 'clr';
export const CLASSIFICATION_RULE_ID_REGEX = createPrefixedIdRegex({ prefix: CLASSIFICATION_RULE_ID_PREFIX });

export const TRANSACTION_CLASSIFICATIONS = ['expense', 'income', 'owner_transfer', 'internal_transfer'] as const;
export type TransactionClassification = typeof TRANSACTION_CLASSIFICATIONS[number];

export const BANK_PROVIDERS = ['mercury', 'wise'] as const;
export type BankProvider = typeof BANK_PROVIDERS[number];

export const SUBSCRIPTION_ID_PREFIX = 'sub';
export const SUBSCRIPTION_ID_REGEX = createPrefixedIdRegex({ prefix: SUBSCRIPTION_ID_PREFIX });

export const FINANCE_GOAL_ID_PREFIX = 'fgl';
export const FINANCE_GOAL_BUCKET_ID_PREFIX = 'fgb';
export const FINANCE_GOAL_VERSION_ID_PREFIX = 'fgv';

export const BILLING_CYCLES = ['weekly', 'monthly', 'quarterly', 'yearly'] as const;
export type BillingCycle = typeof BILLING_CYCLES[number];
