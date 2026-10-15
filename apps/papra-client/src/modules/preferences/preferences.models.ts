import type { MemberPreferences, MemberPreferencesPatch } from './preferences.types';

export function applyPreferencesPatch({ preferences, patch }: { preferences: MemberPreferences; patch: MemberPreferencesPatch }): MemberPreferences {
  return {
    dashboard: { ...preferences.dashboard, ...patch.dashboard },
    navigation: { ...preferences.navigation, ...patch.navigation },
  };
}

// Adds or removes one id from a hidden ids list, without duplicates
export function toggleHiddenId({ hiddenIds, id, isHidden }: { hiddenIds: readonly string[]; id: string; isHidden: boolean }) {
  const others = hiddenIds.filter(hiddenId => hiddenId !== id);

  return isHidden ? [...others, id] : others;
}
