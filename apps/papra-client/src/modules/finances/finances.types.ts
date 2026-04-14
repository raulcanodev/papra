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
};

export type ProviderAccount = {
  id: string;
  name: string;
};
