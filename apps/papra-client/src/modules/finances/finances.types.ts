export type BankConnection = {
  id: string;
  provider: string;
  name: string;
  isActive: boolean;
  lastSyncedAt: Date | null;
  providerAccountId: string | null;
  createdAt: Date;
  cachedBalance: number | null;
  balanceCurrency: string | null;
  lastBalanceFetchedAt: Date | null;
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
  tagIds: string[];
  priority: number;
  isActive: boolean;
  createdAt: Date;
};

export type BillingCycle = 'weekly' | 'monthly' | 'quarterly' | 'yearly';

export type Subscription = {
  id: string;
  name: string;
  amount: number;
  currency: string;
  billingCycle: BillingCycle;
  nextPaymentAt: Date | null;
  category: string | null;
  notes: string | null;
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
};

export type AccountBalance = {
  bankConnectionId: string;
  bankConnectionName: string;
  provider: string;
  balance: number;
  currency: string;
  lastFetchedAt: Date | null;
};

export type OverviewStats = {
  monthlySummary: Array<{ month: string; income: number; expenses: number }>;
  classificationBreakdown: Array<{ classification: string | null; total: number; count: number }>;
  unclassifiedCount: number;
  accountBalances: AccountBalance[];
};
