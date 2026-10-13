/**
 * Locale currently applied to the document by the i18n provider (it keeps `<html lang>` in sync).
 * Handy for module-level formatters that cannot call `useI18n`.
 */
export function getDocumentLocale(): string | undefined {
  return document.documentElement.lang || undefined;
}
