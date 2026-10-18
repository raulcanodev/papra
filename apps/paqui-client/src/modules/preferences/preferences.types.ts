export type DashboardRevenueMode = 'billed' | 'profit';

// Mirrors the server: lists of HIDDEN ids, so whatever is added later shows up by default
export type MemberPreferences = {
  dashboard: { hiddenWidgetIds: string[]; revenueMode: DashboardRevenueMode };
  navigation: { hiddenItemIds: string[] };
};

export type MemberPreferencesPatch = {
  dashboard?: Partial<MemberPreferences['dashboard']>;
  navigation?: Partial<MemberPreferences['navigation']>;
};

export const DEFAULT_MEMBER_PREFERENCES: MemberPreferences = {
  dashboard: { hiddenWidgetIds: [], revenueMode: 'billed' },
  navigation: { hiddenItemIds: ['documents'] },
};
