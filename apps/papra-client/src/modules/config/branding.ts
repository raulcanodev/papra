const getBrandValue = (value: string | undefined, fallback: string) => value?.trim() || fallback;

/**
 * Public-facing brand values live here so renaming the SaaS does not require
 * touching page components. Every value can be overridden at build time.
 */
export const appBrand = {
  name: getBrandValue(import.meta.env.VITE_APP_NAME, 'HeyPaqui'),
  tagline: getBrandValue(import.meta.env.VITE_APP_TAGLINE, 'Your business, finally in order.'),
  description: getBrandValue(
    import.meta.env.VITE_APP_DESCRIPTION,
    'Documents, invoices and finances in one calm workspace.',
  ),
} as const;

const hasCustomTagline = Boolean(import.meta.env.VITE_APP_TAGLINE?.trim());
const hasCustomDescription = Boolean(import.meta.env.VITE_APP_DESCRIPTION?.trim());

/**
 * Applies the brand to the document title and meta tags. Localized copy is used
 * unless the tagline/description were overridden at build time.
 */
export function applyBrandMetadata(localized: { tagline?: string; description?: string } = {}) {
  const tagline = hasCustomTagline ? appBrand.tagline : (localized.tagline ?? appBrand.tagline);
  const description = hasCustomDescription ? appBrand.description : (localized.description ?? appBrand.description);

  document.title = `${appBrand.name} — ${tagline}`;

  const descriptions = document.querySelectorAll<HTMLMetaElement>('meta[name="description"], meta[property="og:description"], meta[property="twitter:description"]');
  descriptions.forEach(meta => meta.setAttribute('content', description));

  const titles = document.querySelectorAll<HTMLMetaElement>('meta[name="title"], meta[property="og:title"], meta[property="twitter:title"]');
  titles.forEach(meta => meta.setAttribute('content', `${appBrand.name} — ${tagline}`));
}
