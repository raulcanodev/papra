import type { TranslationKeys } from '../i18n/locales.types';

/**
 * Onboarding steps. To add one, add an entry here, list it in the flows that
 * should show it (ONBOARDING_FLOWS), render it in onboarding.page.tsx and, if it
 * saves anything, add a handler with the same id in `saveStep`.
 */
export type OnboardingStepId = 'profile' | 'company' | 'fiscal' | 'address' | 'invoicing' | 'taxes' | 'series' | 'branding' | 'team' | 'invitations';

export type OnboardingStep = {
  id: OnboardingStepId;
  titleKey: TranslationKeys;
  descriptionKey: TranslationKeys;
  /** Saved on the organization being set up instead of on the user. */
  scope: 'user' | 'organization';
  /** Can be left for later: the step shows a "skip" button. */
  optional?: boolean;
};

export const ONBOARDING_STEPS: Record<OnboardingStepId, OnboardingStep> = {
  profile: { id: 'profile', scope: 'user', titleKey: 'onboarding.steps.profile.title', descriptionKey: 'onboarding.steps.profile.description' },
  company: { id: 'company', scope: 'organization', titleKey: 'onboarding.steps.company.title', descriptionKey: 'onboarding.steps.company.description' },
  fiscal: { id: 'fiscal', scope: 'organization', titleKey: 'onboarding.steps.fiscal.title', descriptionKey: 'onboarding.steps.fiscal.description' },
  address: { id: 'address', scope: 'organization', optional: true, titleKey: 'onboarding.steps.address.title', descriptionKey: 'onboarding.steps.address.description' },
  invoicing: { id: 'invoicing', scope: 'organization', optional: true, titleKey: 'onboarding.steps.invoicing.title', descriptionKey: 'onboarding.steps.invoicing.description' },
  taxes: { id: 'taxes', scope: 'organization', optional: true, titleKey: 'onboarding.steps.taxes.title', descriptionKey: 'onboarding.steps.taxes.description' },
  series: { id: 'series', scope: 'organization', optional: true, titleKey: 'onboarding.steps.series.title', descriptionKey: 'onboarding.steps.series.description' },
  branding: { id: 'branding', scope: 'organization', optional: true, titleKey: 'onboarding.steps.branding.title', descriptionKey: 'onboarding.steps.branding.description' },
  team: { id: 'team', scope: 'organization', optional: true, titleKey: 'onboarding.steps.team.title', descriptionKey: 'onboarding.steps.team.description' },
  invitations: { id: 'invitations', scope: 'user', titleKey: 'onboarding.steps.invitations.title', descriptionKey: 'onboarding.steps.invitations.description' },
};

const COMPANY_STEPS = ['company', 'fiscal', 'address', 'invoicing', 'taxes', 'series', 'branding', 'team'] as const satisfies readonly OnboardingStepId[];

/**
 * Which steps each kind of onboarding shows, in order.
 * - new-user: someone who signed up on their own; sets up their profile and their company.
 * - new-organization: an existing user creating another company (same setup, without the profile).
 * - invited-user: someone invited to an existing company; only sets up their profile and joins.
 */
export const ONBOARDING_FLOWS = {
  'new-user': ['profile', ...COMPANY_STEPS],
  'new-organization': COMPANY_STEPS,
  'invited-user': ['profile', 'invitations'],
} as const satisfies Record<string, readonly OnboardingStepId[]>;

export type OnboardingFlowId = keyof typeof ONBOARDING_FLOWS;

export function isOnboardingFlow(value: unknown): value is OnboardingFlowId {
  return typeof value === 'string' && Object.hasOwn(ONBOARDING_FLOWS, value);
}

export function getFlowSteps(flow: OnboardingFlowId): OnboardingStep[] {
  return ONBOARDING_FLOWS[flow].map(id => ONBOARDING_STEPS[id]);
}

/** The step to resume a flow at; unknown steps start it from the beginning. */
export function getResumeStepIndex({ flow, stepId }: { flow: OnboardingFlowId; stepId: string | null | undefined }) {
  const index = (ONBOARDING_FLOWS[flow] as readonly string[]).indexOf(stepId ?? '');

  return index === -1 ? 0 : index;
}
