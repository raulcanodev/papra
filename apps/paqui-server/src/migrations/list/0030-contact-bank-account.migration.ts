import type { Migration } from '../migrations.types';
import { sql } from 'drizzle-orm';

export const contactBankAccountMigration = {
  name: 'contact-bank-account',
  description: 'A contact keeps the IBAN or bank account its transfers go to or come from',

  up: async ({ db }) => {
    await db.execute(sql.raw(`ALTER TABLE "contacts" ADD COLUMN IF NOT EXISTS "bank_account" text`));
  },

  down: async ({ db }) => {
    await db.execute(sql.raw(`ALTER TABLE "contacts" DROP COLUMN IF EXISTS "bank_account"`));
  },
} satisfies Migration;
