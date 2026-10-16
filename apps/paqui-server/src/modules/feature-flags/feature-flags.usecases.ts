import type { Database } from '../app/database/database.types';
import type { FeatureFlagId } from './feature-flags.config';
import { createUsersRepository } from '../users/users.repository';
import { createFeatureFlagsRepository } from './feature-flags.repository';

// Feature flags are granted by email: the user is resolved first, then the flag looked up
export async function userHasFeatureFlag({ userId, flagId, db }: { userId: string; flagId: FeatureFlagId | (string & {}); db: Database }) {
  const { user } = await createUsersRepository({ db }).getUserByIdOrThrow({ userId });

  return createFeatureFlagsRepository({ db }).hasFeatureFlag({ flagId, userEmail: user.email });
}
