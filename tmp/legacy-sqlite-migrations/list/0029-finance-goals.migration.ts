import type { Migration } from '../migrations.types';
import { sql } from 'drizzle-orm';

export const financeGoalsMigration: Migration = {
  name: 'finance-goals',
  description: 'Add finance_goals and finance_goal_buckets tables for budget goal tracking',

  up: async ({ db }) => {
    await db.batch([
      db.run(sql`
        CREATE TABLE IF NOT EXISTS "finance_goals" (
          "id" text PRIMARY KEY NOT NULL,
          "created_at" integer NOT NULL,
          "updated_at" integer NOT NULL,
          "organization_id" text NOT NULL REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE,
          "name" text NOT NULL DEFAULT 'Budget'
        )
      `),
      db.run(sql`
        CREATE INDEX IF NOT EXISTS "finance_goals_organization_id_index"
        ON "finance_goals" ("organization_id")
      `),
      db.run(sql`
        CREATE TABLE IF NOT EXISTS "finance_goal_buckets" (
          "id" text PRIMARY KEY NOT NULL,
          "created_at" integer NOT NULL,
          "updated_at" integer NOT NULL,
          "goal_id" text NOT NULL REFERENCES "finance_goals"("id") ON DELETE CASCADE ON UPDATE CASCADE,
          "organization_id" text NOT NULL REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE,
          "name" text NOT NULL,
          "target_percentage" integer NOT NULL DEFAULT 0,
          "color" text NOT NULL DEFAULT '#6366f1',
          "position" integer NOT NULL DEFAULT 0,
          "tag_ids" text NOT NULL DEFAULT '[]',
          "classifications" text NOT NULL DEFAULT '[]'
        )
      `),
      db.run(sql`
        CREATE INDEX IF NOT EXISTS "finance_goal_buckets_goal_id_index"
        ON "finance_goal_buckets" ("goal_id")
      `),
    ]);
  },

  down: async ({ db }) => {
    await db.batch([
      db.run(sql`DROP TABLE IF EXISTS "finance_goal_buckets"`),
      db.run(sql`DROP TABLE IF EXISTS "finance_goals"`),
    ]);
  },
};
