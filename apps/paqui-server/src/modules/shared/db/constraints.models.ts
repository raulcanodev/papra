import { isNil } from '../utils';

// https://www.postgresql.org/docs/current/errcodes-appendix.html
const POSTGRES_UNIQUE_VIOLATION_ERROR_CODE = '23505';

export function isUniqueConstraintError({ error }: { error: unknown }): boolean {
  if (isNil(error) || typeof error !== 'object') {
    return false;
  }

  const code: unknown = 'code' in error ? error.code : undefined;

  if (code === POSTGRES_UNIQUE_VIOLATION_ERROR_CODE) {
    return true;
  }

  // Some drivers/ORM versions wrap the database error
  const cause: unknown = 'cause' in error ? error.cause : undefined;

  return cause !== error && isUniqueConstraintError({ error: cause });
}
