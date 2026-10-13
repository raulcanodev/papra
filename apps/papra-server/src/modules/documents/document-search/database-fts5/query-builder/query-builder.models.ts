import type { Operator } from '@papra/search-parser';
import type { BinaryOperator, SQL } from 'drizzle-orm';
import type { QueryResult } from './query-builder.types';
import { and, eq, gt, gte, lt, lte, or, sql } from 'drizzle-orm';
import { documentsFtsTable } from '../database-fts5.tables';

export type FtsColumn = 'name' | 'content';

const tsvectorColumns = {
  name: documentsFtsTable.nameTsv,
  content: documentsFtsTable.contentTsv,
} as const;

// Builds a phrase query where the last term is matched as a prefix, mimicking the previous FTS5 `"foo bar"*` behavior.
// Tokenization is delegated to Postgres (phraseto_tsquery) so the query is tokenized the same way as the indexed documents
export function buildFtsPrefixPhraseQuery({ value }: { value: string }): SQL {
  return sql`to_tsquery('simple', regexp_replace(phraseto_tsquery('simple', ${value.trim()})::text, '''$', ''':*'))`;
}

export function buildFtsMatchCondition({
  value,
  organizationId,
  matchingColumns = ['name', 'content'],
}: {
  value: string;
  organizationId: string;
  matchingColumns?: FtsColumn[];
}): SQL | undefined {
  const tsQuery = buildFtsPrefixPhraseQuery({ value });

  return and(
    eq(documentsFtsTable.organizationId, organizationId),
    or(...matchingColumns.map(column => sql`${tsvectorColumns[column]} @@ ${tsQuery}`)),
  );
}

const operatorsMap: Record<Operator, BinaryOperator> = {
  '=': eq,
  '<': lt,
  '<=': lte,
  '>': gt,
  '>=': gte,
};

export function getSqlOperator({ operator }: { operator: Operator }): BinaryOperator {
  return operatorsMap[operator];
}

export function createInvalidQueryResult({ message, code}: { message: string; code: string }): QueryResult {
  return {
    sqlQuery: sql`false`,
    issues: [{
      message,
      code,
    }],
  };
}

export function createInvalidDateFormatQueryResult({ field, value }: { field: string; value: string }): QueryResult {
  return createInvalidQueryResult({
    message: `Invalid date format for ${field} filter: "${value}". Expected a valid date string.`,
    code: 'INVALID_DATE_FORMAT',
  });
}

export function createUnsupportedOperatorQueryResult({ operator, field }: { operator: Operator; field: string }): QueryResult {
  return createInvalidQueryResult({
    message: `Unsupported operator "${operator}" for ${field} filter`,
    code: 'UNSUPPORTED_FILTER_OPERATOR',
  });
}
