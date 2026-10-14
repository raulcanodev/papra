import type { Migration } from '../migrations.types';
import { sql } from 'drizzle-orm';

export const taxProfileMigration = {
  name: 'tax-profile',
  description: 'Legal form, VAT regime, income tax method, last corporate tax quota and accountant email in the fiscal profile',

  up: async ({ db }) => {
    await db.transaction(async (tx) => {
      for (const statement of [
        `ALTER TABLE "invoicing_profiles" ADD COLUMN "legal_form" text`,
        `ALTER TABLE "invoicing_profiles" ADD COLUMN "vat_regime" text DEFAULT 'general' NOT NULL`,
        `ALTER TABLE "invoicing_profiles" ADD COLUMN "income_tax_method" text DEFAULT 'direct_simplified' NOT NULL`,
        `ALTER TABLE "invoicing_profiles" ADD COLUMN "last_corporate_tax_quota_minor" integer`,
        `ALTER TABLE "invoicing_profiles" ADD COLUMN "accountant_email" text`,
        `ALTER TABLE "invoicing_profiles" ADD CONSTRAINT "invoicing_profiles_legal_form_check" CHECK ("legal_form" IS NULL OR "legal_form" IN ('self_employed', 'company'))`,
        `ALTER TABLE "invoicing_profiles" ADD CONSTRAINT "invoicing_profiles_vat_regime_check" CHECK ("vat_regime" IN ('general', 'equivalence_surcharge', 'exempt'))`,
        `ALTER TABLE "invoicing_profiles" ADD CONSTRAINT "invoicing_profiles_income_tax_method_check" CHECK ("income_tax_method" IN ('direct_simplified', 'direct_normal', 'modules'))`,
      ]) {
        await tx.execute(sql.raw(statement));
      }
    });
  },

  down: async ({ db }) => {
    await db.transaction(async (tx) => {
      for (const column of ['accountant_email', 'last_corporate_tax_quota_minor', 'income_tax_method', 'vat_regime', 'legal_form']) {
        await tx.execute(sql.raw(`ALTER TABLE "invoicing_profiles" DROP COLUMN "${column}"`));
      }
    });
  },
} satisfies Migration;
