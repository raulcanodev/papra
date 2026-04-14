import type { Expand } from '@corentinth/chisels';
import type { bankConnectionsTable, transactionsTable } from './finances.table';

export type BankConnection = Expand<typeof bankConnectionsTable.$inferSelect>;
export type DbInsertableBankConnection = Expand<typeof bankConnectionsTable.$inferInsert>;

export type Transaction = Expand<typeof transactionsTable.$inferSelect>;
export type DbInsertableTransaction = Expand<typeof transactionsTable.$inferInsert>;
