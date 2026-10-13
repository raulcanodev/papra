import type { Migration } from '../migrations.types';
import { sql } from 'drizzle-orm';

export const classificationRuleDescriptionMigration: Migration = {
  name: 'classification-rule-description',
  description: 'Add description column to classification_rules for AI condition suggestions',

  up: async ({ db }) => {
    const columns = await db.all<{ name: string }>(sql`PRAGMA table_info("classification_rules")`);
    if (!columns.some(({ name }) => name === 'description')) {
      await db.run(sql`
        ALTER TABLE "classification_rules" ADD COLUMN "description" text
      `);
    }
  },

  down: async ({ db }) => {
    const columns = await db.all<{ name: string }>(sql`PRAGMA table_info("classification_rules")`);
    if (columns.some(({ name }) => name === 'description')) {
      await db.run(sql`
        ALTER TABLE "classification_rules" DROP COLUMN "description"
      `);
    }
  },
};
