import type { Database } from '../../modules/app/database/database.types';
import type { Migration } from '../migrations.types';
import { sql } from 'drizzle-orm';
import { getRawQueryRows } from '../../modules/app/database/database.usecases';
import { CUSTOM_PROPERTY_DEFINITION_ID_PREFIX } from '../../modules/custom-properties/custom-properties.constants';
import { CUSTOM_PROPERTY_SELECT_OPTION_ID_PREFIX } from '../../modules/custom-properties/options/custom-properties-options.constants';
import { generateId } from '../../modules/shared/random/ids';

// Until now, the definitions of an organization were shared between documents and transactions.
// Each definition now targets a single entity type, so the definitions only used by transactions are moved to the
// transaction entity type, and the ones used by both are duplicated so the transactions keep their values.
async function splitDefinitionsSharedWithTransactions({ db }: { db: Database }) {
  await db.execute(sql.raw(`
    UPDATE "custom_property_definitions" AS d SET "entity_type" = 'transaction'
    WHERE EXISTS (SELECT 1 FROM "transaction_custom_property_values" t WHERE t."property_definition_id" = d."id")
    AND NOT EXISTS (SELECT 1 FROM "document_custom_property_values" v WHERE v."property_definition_id" = d."id")
  `));

  const sharedDefinitions = getRawQueryRows<{ id: string }>(await db.execute(sql.raw(`
    SELECT d."id" FROM "custom_property_definitions" d
    WHERE EXISTS (SELECT 1 FROM "transaction_custom_property_values" t WHERE t."property_definition_id" = d."id")
    AND EXISTS (SELECT 1 FROM "document_custom_property_values" v WHERE v."property_definition_id" = d."id")
  `)));

  for (const { id: definitionId } of sharedDefinitions) {
    const transactionDefinitionId = generateId({ prefix: CUSTOM_PROPERTY_DEFINITION_ID_PREFIX });

    await db.execute(sql`
      INSERT INTO "custom_property_definitions" ("id", "created_at", "updated_at", "organization_id", "name", "key", "description", "type", "entity_type", "config", "display_order")
      SELECT ${transactionDefinitionId}, "created_at", now(), "organization_id", "name", "key", "description", "type", 'transaction', "config", "display_order"
      FROM "custom_property_definitions" WHERE "id" = ${definitionId}
    `);

    const options = getRawQueryRows<{ id: string }>(await db.execute(sql`SELECT "id" FROM "custom_property_select_options" WHERE "property_definition_id" = ${definitionId}`));

    for (const { id: optionId } of options) {
      const transactionOptionId = generateId({ prefix: CUSTOM_PROPERTY_SELECT_OPTION_ID_PREFIX });

      await db.execute(sql`
        INSERT INTO "custom_property_select_options" ("id", "created_at", "updated_at", "property_definition_id", "name", "key", "display_order")
        SELECT ${transactionOptionId}, "created_at", now(), ${transactionDefinitionId}, "name", "key", "display_order"
        FROM "custom_property_select_options" WHERE "id" = ${optionId}
      `);

      await db.execute(sql`
        UPDATE "transaction_custom_property_values" SET "select_option_id" = ${transactionOptionId}
        WHERE "property_definition_id" = ${definitionId} AND "select_option_id" = ${optionId}
      `);
    }

    await db.execute(sql`UPDATE "transaction_custom_property_values" SET "property_definition_id" = ${transactionDefinitionId} WHERE "property_definition_id" = ${definitionId}`);
  }
}

export const entityCustomPropertiesMigration = {
  name: 'entity-custom-properties',
  description: 'Scope custom property definitions to an entity type and add the generic entity custom property values table',

  up: async ({ db }) => {
    await db.transaction(async (tx) => {
      const statements = [
        `ALTER TABLE "custom_property_definitions" ADD COLUMN "entity_type" text DEFAULT 'document' NOT NULL`,

        `DROP INDEX "custom_property_definitions_organization_id_key_unique"`,
        `DROP INDEX "custom_property_definitions_organization_id_name_unique"`,
        `CREATE UNIQUE INDEX "custom_property_definitions_organization_id_entity_type_key_unique" ON "custom_property_definitions" USING btree ("organization_id","entity_type","key")`,
        `CREATE UNIQUE INDEX "custom_property_definitions_organization_id_entity_type_name_unique" ON "custom_property_definitions" USING btree ("organization_id","entity_type","name")`,
        `CREATE UNIQUE INDEX "custom_property_definitions_id_organization_id_entity_type_unique" ON "custom_property_definitions" USING btree ("id","organization_id","entity_type")`,
        `CREATE UNIQUE INDEX "custom_property_select_options_id_definition_id_unique" ON "custom_property_select_options" USING btree ("id","property_definition_id")`,
      ];

      for (const statement of statements) {
        await tx.execute(sql.raw(statement));
      }

      await splitDefinitionsSharedWithTransactions({ db: tx as unknown as Database });

      const entityValuesStatements = [
        `CREATE TABLE "entity_custom_property_values" (
  "id" text PRIMARY KEY NOT NULL,
  "created_at" timestamp (3) with time zone NOT NULL,
  "updated_at" timestamp (3) with time zone NOT NULL,
  "organization_id" text NOT NULL,
  "entity_type" text NOT NULL,
  "entity_id" text NOT NULL,
  "property_definition_id" text NOT NULL,
  "text_value" text,
  "number_value" double precision,
  "date_value" timestamp (3) with time zone,
  "boolean_value" boolean,
  "select_option_id" text
)`,
        `ALTER TABLE "entity_custom_property_values" ADD CONSTRAINT "entity_custom_property_values_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE cascade`,
        `ALTER TABLE "entity_custom_property_values" ADD CONSTRAINT "entity_cpv_definition_fk" FOREIGN KEY ("property_definition_id","organization_id","entity_type") REFERENCES "public"."custom_property_definitions"("id","organization_id","entity_type") ON DELETE cascade ON UPDATE cascade`,
        `ALTER TABLE "entity_custom_property_values" ADD CONSTRAINT "entity_cpv_select_option_fk" FOREIGN KEY ("select_option_id","property_definition_id") REFERENCES "public"."custom_property_select_options"("id","property_definition_id") ON DELETE cascade ON UPDATE cascade`,
        `CREATE INDEX "entity_cpv_organization_entity_index" ON "entity_custom_property_values" USING btree ("organization_id","entity_type","entity_id","property_definition_id")`,
        `CREATE INDEX "entity_cpv_property_definition_id_index" ON "entity_custom_property_values" USING btree ("property_definition_id")`,
        `CREATE INDEX "entity_cpv_select_option_id_index" ON "entity_custom_property_values" USING btree ("select_option_id")`,
        // Same policy as the initial schema: RLS enabled without policy, only the table owner role (the server) has access
        `ALTER TABLE "entity_custom_property_values" ENABLE ROW LEVEL SECURITY`,
      ];

      for (const statement of entityValuesStatements) {
        await tx.execute(sql.raw(statement));
      }
    });
  },

  down: async ({ db }) => {
    await db.transaction(async (tx) => {
      const statements = [
        `DROP TABLE "entity_custom_property_values"`,
        `DROP INDEX "custom_property_select_options_id_definition_id_unique"`,
        `DROP INDEX "custom_property_definitions_id_organization_id_entity_type_unique"`,
        `DROP INDEX "custom_property_definitions_organization_id_entity_type_key_unique"`,
        `DROP INDEX "custom_property_definitions_organization_id_entity_type_name_unique"`,
        // Definitions of the generic entities cannot exist without an entity type
        `DELETE FROM "custom_property_definitions" WHERE "entity_type" NOT IN ('document', 'transaction')`,
        `ALTER TABLE "custom_property_definitions" DROP COLUMN "entity_type"`,
        `CREATE UNIQUE INDEX "custom_property_definitions_organization_id_key_unique" ON "custom_property_definitions" USING btree ("organization_id","key")`,
        `CREATE UNIQUE INDEX "custom_property_definitions_organization_id_name_unique" ON "custom_property_definitions" USING btree ("organization_id","name")`,
      ];

      for (const statement of statements) {
        await tx.execute(sql.raw(statement));
      }
    });
  },
} satisfies Migration;
