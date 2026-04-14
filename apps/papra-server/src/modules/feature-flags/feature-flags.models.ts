import type { FeatureFlagId } from './feature-flags.config';
import { featureFlags } from './feature-flags.config';

export function hasFeatureAccess({ flagId, userEmail }: { flagId: FeatureFlagId; userEmail: string }): boolean {
  const flag = featureFlags[flagId];
  return flag.allowedEmails.includes(userEmail);
}

export function getUserFeatureFlags({ userEmail }: { userEmail: string }): FeatureFlagId[] {
  return (Object.keys(featureFlags) as FeatureFlagId[]).filter(
    flagId => hasFeatureAccess({ flagId, userEmail }),
  );
}
