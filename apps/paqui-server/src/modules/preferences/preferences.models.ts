import { z } from 'zod';

// How each member wants the workspace to look: which home cards and which menu entries they see.
// Lists of HIDDEN ids rather than visible ones, so a card or a menu entry added later shows up by default.
const idListSchema = z.array(z.string().trim().min(1).max(64)).max(100);

export const DASHBOARD_REVENUE_MODES = ['billed', 'profit'] as const;

export const memberPreferencesSchema = z.object({
  dashboard: z.object({
    hiddenWidgetIds: idListSchema.default([]),
    /** What the revenue card shows: what was billed (VAT included) or the profit (sales minus expenses, without VAT) */
    revenueMode: z.enum(DASHBOARD_REVENUE_MODES).default('billed'),
  }).default({}),
  navigation: z.object({
    hiddenItemIds: idListSchema.default(['documents']),
  }).default({}),
});

export type MemberPreferences = z.infer<typeof memberPreferencesSchema>;

// An update carries only what changes, section by section
export const memberPreferencesPatchSchema = z.object({
  dashboard: memberPreferencesSchema.shape.dashboard.removeDefault().partial().optional(),
  navigation: memberPreferencesSchema.shape.navigation.removeDefault().partial().optional(),
});

export type MemberPreferencesPatch = z.infer<typeof memberPreferencesPatchSchema>;

// Whatever is stored (possibly written by an older version, possibly with unknown keys) comes back complete and valid
export function parseStoredPreferences({ stored }: { stored: unknown }): MemberPreferences {
  const result = memberPreferencesSchema.safeParse(stored ?? {});

  return result.success ? result.data : memberPreferencesSchema.parse({});
}

export function mergePreferences({ current, patch }: { current: MemberPreferences; patch: MemberPreferencesPatch }): MemberPreferences {
  return {
    dashboard: { ...current.dashboard, ...patch.dashboard },
    navigation: { ...current.navigation, ...patch.navigation },
  };
}
