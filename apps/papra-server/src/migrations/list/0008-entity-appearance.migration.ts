import type { Migration } from '../migrations.types';
import { sql } from 'drizzle-orm';

export const entityAppearanceMigration = {
  name: 'entity-appearance',
  description: 'Emoji or icon and tile color of contacts and products, shown in the first column of their tables',

  up: async ({ db }) => {
    await db.transaction(async (tx) => {
      for (const statement of [
        `ALTER TABLE "contacts" ADD COLUMN IF NOT EXISTS "icon" text`,
        `ALTER TABLE "contacts" ADD COLUMN IF NOT EXISTS "icon_color" text`,
        `ALTER TABLE "invoicing_products" ADD COLUMN IF NOT EXISTS "icon" text`,
        `ALTER TABLE "invoicing_products" ADD COLUMN IF NOT EXISTS "icon_color" text`,
      ]) {
        await tx.execute(sql.raw(statement));
      }
    });
  },

  down: async ({ db }) => {
    await db.transaction(async (tx) => {
      for (const statement of [
        `ALTER TABLE "invoicing_products" DROP COLUMN IF EXISTS "icon_color"`,
        `ALTER TABLE "invoicing_products" DROP COLUMN IF EXISTS "icon"`,
        `ALTER TABLE "contacts" DROP COLUMN IF EXISTS "icon_color"`,
        `ALTER TABLE "contacts" DROP COLUMN IF EXISTS "icon"`,
      ]) {
        await tx.execute(sql.raw(statement));
      }
    });
  },
} satisfies Migration;
