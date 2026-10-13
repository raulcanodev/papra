import type { Component } from 'solid-js';
import { OnboardingTool } from './tools/onboarding.tool';
import { SessionTool } from './tools/session.tool';

/**
 * Tools shown in the dev tools panel, in order. To add one, create a component
 * in ./tools and register it here.
 */
export type DevTool = { id: string; title: string; component: Component };

export const DEV_TOOLS: DevTool[] = [
  { id: 'onboarding', title: 'Onboarding', component: OnboardingTool },
  { id: 'session', title: 'Session', component: SessionTool },
];
