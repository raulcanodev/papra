import type { OrganizationNavigationCapabilities } from './organization-navigation';
import { useFeatureFlags } from '@/modules/feature-flags/feature-flags.provider';

// Which parts of the app this organization has, shared by the menu and by the assistant so both show the same pages
export function useNavigationCapabilities() {
  const { hasFlag } = useFeatureFlags();

  return (): OrganizationNavigationCapabilities => ({
    'invoicing': true,
    'personal-finances': hasFlag('llc_finances'),
  });
}
