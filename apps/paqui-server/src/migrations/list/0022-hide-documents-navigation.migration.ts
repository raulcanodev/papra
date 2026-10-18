import type { Migration } from '../migrations.types';
import { sql } from 'drizzle-orm';

export const hideDocumentsNavigationMigration = {
  name: 'hide-documents-navigation',
  description: 'Make documents an optional navigation entry, hidden for existing members by default',

  up: async ({ db }) => {
    await db.execute(sql.raw(`
      UPDATE "member_preferences"
      SET "preferences" = "preferences" || jsonb_build_object(
        'navigation',
        COALESCE("preferences"->'navigation', '{}'::jsonb) || jsonb_build_object(
          'hiddenItemIds',
          CASE
            WHEN COALESCE("preferences"#>'{navigation,hiddenItemIds}', '[]'::jsonb) ? 'documents'
              THEN COALESCE("preferences"#>'{navigation,hiddenItemIds}', '[]'::jsonb)
            ELSE COALESCE("preferences"#>'{navigation,hiddenItemIds}', '[]'::jsonb) || '["documents"]'::jsonb
          END
        )
      )
    `));
  },

  down: async ({ db }) => {
    await db.execute(sql.raw(`
      UPDATE "member_preferences"
      SET "preferences" = "preferences" || jsonb_build_object(
        'navigation',
        COALESCE("preferences"->'navigation', '{}'::jsonb) || jsonb_build_object(
          'hiddenItemIds',
          COALESCE((
            SELECT jsonb_agg("item")
            FROM jsonb_array_elements(COALESCE("preferences"#>'{navigation,hiddenItemIds}', '[]'::jsonb)) AS "item"
            WHERE "item" <> '"documents"'::jsonb
          ), '[]'::jsonb)
        )
      )
    `));
  },
} satisfies Migration;
