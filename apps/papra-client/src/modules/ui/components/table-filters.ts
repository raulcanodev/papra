import type { JSX } from 'solid-js';

export type FilterOption = {
  value: string;
  label: string;
  description?: string;
  icon?: JSX.Element;
  keywords?: string;
};

export type DateRangePreset = 'today' | 'this_week' | 'this_month' | 'last_month' | 'last_30' | 'this_year' | 'last_year';

export type DateRangeValue = {
  from: string;
  to: string;
  preset?: DateRangePreset;
};

export type FilterValue = string[] | string | DateRangeValue;
export type ActiveFilter = { fieldId: string; value: FilterValue };

type FilterFieldBase = {
  id: string;
  label: string;
  icon?: string;
  required?: boolean;
};

export type FilterField = FilterFieldBase & (
  | { type: 'select' | 'multi-select'; options: FilterOption[]; searchable?: boolean }
  | { type: 'date-range'; presets?: DateRangePreset[] }
);

export function getActiveFilter(filters: ActiveFilter[], fieldId: string) {
  return filters.find(filter => filter.fieldId === fieldId);
}

/** The values picked in a select or multi-select filter, empty when the filter is not set */
export function getSelectedFilterValues(filters: ActiveFilter[], fieldId: string): string[] {
  const value = getActiveFilter(filters, fieldId)?.value;

  return Array.isArray(value) ? value : [];
}

/** Whether a row value passes a select or multi-select filter, every row passes when nothing is picked */
export function matchesSelectedFilter(filters: ActiveFilter[], fieldId: string, value: string | null | undefined) {
  const selected = getSelectedFilterValues(filters, fieldId);

  return selected.length === 0 || (value !== null && value !== undefined && selected.includes(value));
}

/** The distinct values of a column as filter options, sorted by label */
export function toDistinctFilterOptions<T>(rows: T[], getOption: (row: T) => FilterOption | null): FilterOption[] {
  const options = new Map<string, FilterOption>();

  for (const row of rows) {
    const option = getOption(row);
    if (option !== null && !options.has(option.value)) {
      options.set(option.value, option);
    }
  }

  return [...options.values()].sort((left, right) => left.label.localeCompare(right.label));
}

export function isEmptyFilterValue(value: FilterValue | undefined) {
  if (!value) {
    return true;
  }
  if (Array.isArray(value)) {
    return value.length === 0;
  }
  if (typeof value === 'string') {
    return value.trim().length === 0;
  }
  return !value.from || !value.to;
}

export function setActiveFilterValue(filters: ActiveFilter[], fieldId: string, value: FilterValue | undefined): ActiveFilter[] {
  if (isEmptyFilterValue(value)) {
    return filters.filter(filter => filter.fieldId !== fieldId);
  }
  const next = { fieldId, value: value! };
  return filters.some(filter => filter.fieldId === fieldId)
    ? filters.map(filter => filter.fieldId === fieldId ? next : filter)
    : [...filters, next];
}

export function clearRemovableFilters(filters: ActiveFilter[], fields: FilterField[]) {
  return filters.filter(filter => fields.find(field => field.id === filter.fieldId)?.required);
}

const pad = (value: number) => String(value).padStart(2, '0');
export const toIsoDate = (date: Date) => `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;

export function fromIsoDate(value: string) {
  const [year, month, day] = value.split('-').map(Number);
  return new Date(year!, month! - 1, day!);
}

function addDays(date: Date, days: number) {
  const next = new Date(date);
  next.setDate(next.getDate() + days);
  return next;
}

export function resolveDatePreset(preset: DateRangePreset, now = new Date()): DateRangeValue {
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const weekStart = addDays(today, -((today.getDay() + 6) % 7));
  const ranges: Record<DateRangePreset, [Date, Date]> = {
    today: [today, today],
    this_week: [weekStart, addDays(weekStart, 6)],
    this_month: [new Date(today.getFullYear(), today.getMonth(), 1), new Date(today.getFullYear(), today.getMonth() + 1, 0)],
    last_month: [new Date(today.getFullYear(), today.getMonth() - 1, 1), new Date(today.getFullYear(), today.getMonth(), 0)],
    last_30: [addDays(today, -29), today],
    this_year: [new Date(today.getFullYear(), 0, 1), new Date(today.getFullYear(), 11, 31)],
    last_year: [new Date(today.getFullYear() - 1, 0, 1), new Date(today.getFullYear() - 1, 11, 31)],
  };
  const [from, to] = ranges[preset];
  return { from: toIsoDate(from), to: toIsoDate(to), preset };
}

export function isDateRangeValue(value: FilterValue | undefined): value is DateRangeValue {
  return !!value && typeof value === 'object' && !Array.isArray(value);
}

export function dateIsInRange(date: Date, range: DateRangeValue) {
  const value = toIsoDate(date);
  return value >= range.from && value <= range.to;
}

export function formatDateRange(range: DateRangeValue, locale: string) {
  const formatter = new Intl.DateTimeFormat(locale, { day: 'numeric', month: 'short', year: range.from.slice(0, 4) !== range.to.slice(0, 4) ? 'numeric' : undefined });
  const from = formatter.format(fromIsoDate(range.from));
  const to = formatter.format(fromIsoDate(range.to));
  return from === to ? from : `${from} – ${to}`;
}
