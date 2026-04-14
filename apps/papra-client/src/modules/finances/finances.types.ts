export type BankConnection = {
  id: string;
  provider: string;
  name: string;
  isActive: boolean;
  lastSyncedAt: Date | null;
  providerAccountId: string | null;
  createdAt: Date;
};

export type Transaction = {
  id: string;
  date: Date;
  description: string;
  amount: number;
  currency: string;
  counterparty: string | null;
  status: string;
  classification: string | null;
  provider: string;
  bankConnectionId: string;
  rawData: string | null;
};

export type ProviderAccount = {
  id: string;
  name: string;
};

export type RuleCondition = {
  field: string;
  operator: string;
  value: string;
};

export type ClassificationRule = {
  id: string;
  name: string;
  classification: string;
  conditions: RuleCondition[];
  conditionMatchMode: 'all' | 'any';
  priority: number;
  isActive: boolean;
  createdAt: Date;
};
