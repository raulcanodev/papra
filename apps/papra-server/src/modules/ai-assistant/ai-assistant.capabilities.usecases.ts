import type { Database } from '../app/database/database.types';
import type { AssistantCapabilities } from './ai-assistant.capabilities';
import { userHasFeatureFlag } from '../feature-flags/feature-flags.usecases';

export async function getAssistantCapabilities({ userId, db }: { userId: string; db: Database }): Promise<AssistantCapabilities> {
  return {
    // Same flag that guards the finances routes and pages
    personalFinances: await userHasFeatureFlag({ userId, flagId: 'llc_finances', db }),
  };
}
