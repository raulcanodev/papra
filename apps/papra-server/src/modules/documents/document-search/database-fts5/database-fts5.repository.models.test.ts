import type { SQL } from 'drizzle-orm';
import { PgDialect } from 'drizzle-orm/pg-core';
import { describe, expect, test } from 'vitest';
import { createInMemoryDatabase } from '../../../app/database/database.test-utils';
import { makeSearchWhereClause } from './database-fts5.repository.models';

const tsQuery = (placeholder: string) => `to_tsquery('simple', regexp_replace(phraseto_tsquery('simple', ${placeholder})::text, '''$', ''':*'))`;

describe('database-fts5 repository models', () => {
  describe('makeSearchWhereClause', async () => {
    const { db } = await createInMemoryDatabase();

    const pgDialect = new PgDialect();
    const getSqlString = (query?: SQL) => {
      if (!query) {
        return { sql: '', params: [] };
      }

      const { sql, params } = pgDialect.sqlToQuery(query);
      return { sql, params };
    };

    test('a simple text query', () => {
      const { issues, searchWhereClause } = makeSearchWhereClause({ organizationId: 'org_1', query: 'foo', db });

      expect(issues).to.eql([]);
      expect(getSqlString(searchWhereClause)).to.eql({
        sql: `("documents"."organization_id" = $1 and "documents"."is_deleted" = $2 and "documents"."id" in (select distinct "document_id" from "documents_fts" where ("documents_fts"."organization_id" = $3 and ("documents_fts"."name_tsv" @@ ${tsQuery('$4')} or "documents_fts"."content_tsv" @@ ${tsQuery('$5')}))))`,
        params: ['org_1', false, 'org_1', 'foo', 'foo'],
      });
    });

    test('a complex query', () => {
      const { issues, searchWhereClause } = makeSearchWhereClause({
        organizationId: 'org_1',
        query: '(tag:important OR tag:urgent) AND NOT confidential',
        db,
      });

      expect(issues).to.eql([]);
      expect(getSqlString(searchWhereClause)).to.eql({
        sql: `("documents"."organization_id" = $1 and "documents"."is_deleted" = $2 and (("documents"."id" in (select distinct "documents_tags"."document_id" from "documents_tags" inner join "tags" on "documents_tags"."tag_id" = "tags"."id" where ("tags"."organization_id" = $3 and "tags"."normalized_name" = $4)) or "documents"."id" in (select distinct "documents_tags"."document_id" from "documents_tags" inner join "tags" on "documents_tags"."tag_id" = "tags"."id" where ("tags"."organization_id" = $5 and "tags"."normalized_name" = $6))) and not "documents"."id" in (select distinct "document_id" from "documents_fts" where ("documents_fts"."organization_id" = $7 and ("documents_fts"."name_tsv" @@ ${tsQuery('$8')} or "documents_fts"."content_tsv" @@ ${tsQuery('$9')})))))`,
        params: ['org_1', false, 'org_1', 'important', 'org_1', 'urgent', 'org_1', 'confidential', 'confidential'],
      });
    });
  });
});
