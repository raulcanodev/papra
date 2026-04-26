import type { Migration } from '../migrations.types';
import { sql } from 'drizzle-orm';

export const classificationRuleDescriptionMigration: Migration = {
  name: 'classification-rule-description',
  description: 'Add description column to classification_rules for AI condition suggestions',

  up: async ({ db }) => {
    await db.run(sql`
      ALTER TABLE "classification_rules" ADD COLUMN "description" text
    `);
  },

  down: async ({ db }) => {
    await db.run(sql`
      ALTER TABLE "classification_rules" DROP COLUMN "description"
    `);
  },
};
