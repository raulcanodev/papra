// Feature flag definitions: map of flagId -> allowed user emails
// Add new flags here as needed
export const featureFlags = {
  llc_finances: {
    allowedEmails: ['rawraul5@gmail.com'],
  },
} as const;

export type FeatureFlagId = keyof typeof featureFlags;
