import type { Migration } from '../migrations.types';
import { sql } from 'drizzle-orm';

export const financeGoalVersionsMigration: Migration = {
  name: 'finance-goal-versions',
  description: 'Add finance_goal_versions table for goal versioning/rollback, and seed initial versions from existing goals',

  up: async ({ db }) => {
    await db.run(sql`
      CREATE TABLE IF NOT EXISTS "finance_goal_versions" (
        "id" text PRIMARY KEY NOT NULL,
        "created_at" integer NOT NULL,
        "updated_at" integer NOT NULL,
        "goal_id" text NOT NULL REFERENCES "finance_goals"("id") ON DELETE CASCADE ON UPDATE CASCADE,
        "organization_id" text NOT NULL REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE,
        "version_number" integer NOT NULL,
        "name" text NOT NULL,
        "buckets_snapshot" text NOT NULL DEFAULT '[]'
      )
    `);

    await db.run(sql`
      CREATE INDEX IF NOT EXISTS "finance_goal_versions_goal_id_index"
      ON "finance_goal_versions" ("goal_id")
    `);

    // Seed a v1 snapshot for every existing goal, capturing their current buckets
    await db.run(sql`
      INSERT INTO "finance_goal_versions"
        ("id", "created_at", "updated_at", "goal_id", "organization_id", "version_number", "name", "buckets_snapshot")
      SELECT
        'fgv_seed_' || fg."id",
        fg."created_at",
        fg."updated_at",
        fg."id",
        fg."organization_id",
        1,
        fg."name",
        COALESCE(
          (
            SELECT json_group_array(
              json_object(
                'id', b."id",
                'name', b."name",
                'targetPercentage', b."target_percentage",
                'color', b."color",
                'position', b."position",
                'tagIds', json(b."tag_ids"),
                'classifications', json(b."classifications")
              )
            )
            FROM "finance_goal_buckets" b
            WHERE b."goal_id" = fg."id"
            ORDER BY b."position"
          ),
          '[]'
        )
      FROM "finance_goals" fg
    `);
  },

  down: async ({ db }) => {
    await db.run(sql`DROP TABLE IF EXISTS "finance_goal_versions"`);
  },
};
