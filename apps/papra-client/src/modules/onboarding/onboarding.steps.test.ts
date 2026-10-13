import { describe, expect, test } from 'vitest';
import { getFlowSteps, getResumeStepIndex, isOnboardingFlow, ONBOARDING_FLOWS } from './onboarding.steps';

describe('onboarding steps', () => {
  test('a new user sets up their profile, then their company', () => {
    expect(ONBOARDING_FLOWS['new-user']).to.eql(['profile', 'company', 'fiscal', 'address', 'invoicing', 'taxes', 'series', 'branding', 'team']);
  });

  test('another company skips the profile, and an invited user never sets up a company', () => {
    expect(getFlowSteps('new-organization').map(step => step.id)).not.to.include('profile');
    expect(getFlowSteps('invited-user').every(step => step.scope === 'user')).to.eql(true);
  });

  test('resuming starts at the saved step, or at the beginning for unknown steps', () => {
    expect(getResumeStepIndex({ flow: 'new-user', stepId: 'taxes' })).to.eql(5);
    expect(getResumeStepIndex({ flow: 'new-organization', stepId: 'profile' })).to.eql(0);
    expect(getResumeStepIndex({ flow: 'invited-user', stepId: null })).to.eql(0);
  });

  test('isOnboardingFlow only accepts known flows', () => {
    expect(isOnboardingFlow('invited-user')).to.eql(true);
    expect(isOnboardingFlow('nope')).to.eql(false);
    expect(isOnboardingFlow(undefined)).to.eql(false);
  });
});
