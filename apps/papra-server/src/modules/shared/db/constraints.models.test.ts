import { describe, expect, test } from 'vitest';
import { isUniqueConstraintError } from './constraints.models';

describe('constraints models', () => {
  describe('isUniqueConstraintError', () => {
    test('in case of an insertion of a record with a unique constraint violation, an error with the postgres code 23505 is raised by the db driver', () => {
      expect(isUniqueConstraintError({ error: { code: '23505' } })).to.eql(true);
      expect(isUniqueConstraintError({ error: Object.assign(new Error('error'), { code: '23505' }) })).to.eql(true);

      expect(isUniqueConstraintError({ error: { code: 'other' } })).to.eql(false);
      expect(isUniqueConstraintError({ error: {} })).to.eql(false);
      expect(isUniqueConstraintError({ error: null })).to.eql(false);
      expect(isUniqueConstraintError({ error: new Set([Symbol('bob')]) })).to.eql(false);
    });

    test('when the database error is wrapped, the cause is inspected', () => {
      expect(isUniqueConstraintError({ error: new Error('Failed query', { cause: { code: '23505' } }) })).to.eql(true);
      expect(isUniqueConstraintError({ error: new Error('Failed query', { cause: { code: '23503' } }) })).to.eql(false);
    });
  });
});
