import type { SQL } from 'drizzle-orm';
import { PgDialect } from 'drizzle-orm/pg-core';
import { describe, expect, test } from 'vitest';
import { buildFtsMatchCondition } from './query-builder.models';

const tsQuery = (placeholder: string) => `to_tsquery('simple', regexp_replace(phraseto_tsquery('simple', ${placeholder})::text, '''$', ''':*'))`;

describe('query-builder models', () => {
  describe('buildFtsMatchCondition', () => {
    const pgDialect = new PgDialect();
    const toSqlAndParams = (query: SQL) => {
      const { sql, params } = pgDialect.sqlToQuery(query);
      return { sql, params };
    };

    test('for a standard query, the organization id is included and matching is done on name and content columns by default', () => {
      const condition = buildFtsMatchCondition({ value: 'foobar', organizationId: 'org_1' });

      expect(toSqlAndParams(condition!)).to.eql({
        sql: `("documents_fts"."organization_id" = $1 and ("documents_fts"."name_tsv" @@ ${tsQuery('$2')} or "documents_fts"."content_tsv" @@ ${tsQuery('$3')}))`,
        params: ['org_1', 'foobar', 'foobar'],
      });
    });

    test('the matching columns can be customized, the value is trimmed', () => {
      const condition = buildFtsMatchCondition({ value: '  foobar ', organizationId: 'org_1', matchingColumns: ['name'] });

      expect(toSqlAndParams(condition!)).to.eql({
        sql: `("documents_fts"."organization_id" = $1 and "documents_fts"."name_tsv" @@ ${tsQuery('$2')})`,
        params: ['org_1', 'foobar'],
      });
    });
  });
});
