// Per viewer, per organization preference: which widgets are hidden. Stored in the browser for now, the widget ids
// are stable so this can move to a server side, shareable layout later without changing the widgets.
const getStorageKey = ({ organizationId }: { organizationId: string }) => `paqui_dashboard_hidden_widgets:${organizationId}`;

export function readHiddenWidgetIds({ organizationId }: { organizationId: string }): string[] {
  try {
    const raw = localStorage.getItem(getStorageKey({ organizationId }));
    const parsed: unknown = raw === null ? [] : JSON.parse(raw);

    return Array.isArray(parsed) ? parsed.filter((id): id is string => typeof id === 'string') : [];
  } catch {
    return [];
  }
}

export function writeHiddenWidgetIds({ organizationId, hiddenWidgetIds }: { organizationId: string; hiddenWidgetIds: string[] }) {
  try {
    localStorage.setItem(getStorageKey({ organizationId }), JSON.stringify(hiddenWidgetIds));
  } catch {
    // Storage can be unavailable (private mode, blocked site data): the choice simply lasts for the session
  }
}
