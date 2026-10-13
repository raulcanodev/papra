import { eq, ilike, or } from 'drizzle-orm';
import { escapeLikeWildcards } from '../shared/db/sql.helpers';
import { isNilOrEmptyString } from '../shared/utils';
import { USER_ID_REGEX } from './users.constants';
import { usersTable } from './users.table';

export function createSearchUserWhereClause({ search }: { search?: string }) {
  const trimmedSearch = search?.trim();

  if (isNilOrEmptyString(trimmedSearch)) {
    return undefined;
  }

  if (USER_ID_REGEX.test(trimmedSearch)) {
    return eq(usersTable.id, trimmedSearch);
  }

  const escapedSearch = escapeLikeWildcards(trimmedSearch);
  const likeSearch = `%${escapedSearch}%`;

  return or(
    ilike(usersTable.email, likeSearch),
    ilike(usersTable.name, likeSearch),
  );
}
