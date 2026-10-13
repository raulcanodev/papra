import type { Component } from 'solid-js';
import type { TranslationKeys } from '@/modules/i18n/locales.types';
import { useI18n } from '@/modules/i18n/i18n.provider';
import { Badge } from '@/modules/ui/components/badge';
import { Card, CardContent } from '@/modules/ui/components/card';

const placeholderPages = {
  home: {
    titleKey: 'placeholder.home.title',
    descriptionKey: 'placeholder.home.description',
    icon: 'i-tabler-home',
  },
  invoices: {
    titleKey: 'placeholder.invoices.title',
    descriptionKey: 'placeholder.invoices.description',
    icon: 'i-tabler-receipt',
  },
  customers: {
    titleKey: 'placeholder.customers.title',
    descriptionKey: 'placeholder.customers.description',
    icon: 'i-tabler-building-store',
  },
  products: {
    titleKey: 'placeholder.products.title',
    descriptionKey: 'placeholder.products.description',
    icon: 'i-tabler-package',
  },
  salesRepresentatives: {
    titleKey: 'placeholder.sales-representatives.title',
    descriptionKey: 'placeholder.sales-representatives.description',
    icon: 'i-tabler-user-dollar',
  },
  modules: {
    titleKey: 'placeholder.modules.title',
    descriptionKey: 'placeholder.modules.description',
    icon: 'i-tabler-layout-grid',
  },
  fiscalProfile: {
    titleKey: 'placeholder.fiscal-profile.title',
    descriptionKey: 'placeholder.fiscal-profile.description',
    icon: 'i-tabler-building-bank',
  },
  invoiceSeries: {
    titleKey: 'placeholder.invoice-series.title',
    descriptionKey: 'placeholder.invoice-series.description',
    icon: 'i-tabler-list-numbers',
  },
  taxes: {
    titleKey: 'placeholder.taxes.title',
    descriptionKey: 'placeholder.taxes.description',
    icon: 'i-tabler-percentage',
  },
  verifactu: {
    titleKey: 'placeholder.verifactu.title',
    descriptionKey: 'placeholder.verifactu.description',
    icon: 'i-tabler-shield-check',
  },
  invoiceBranding: {
    titleKey: 'placeholder.invoice-branding.title',
    descriptionKey: 'placeholder.invoice-branding.description',
    icon: 'i-tabler-brush',
  },
} as const satisfies Record<string, { titleKey: TranslationKeys; descriptionKey: TranslationKeys; icon: string }>;

export type OrganizationPlaceholderPageId = keyof typeof placeholderPages;

export const OrganizationPlaceholderPage: Component<{ pageId: OrganizationPlaceholderPageId }> = (props) => {
  const { t } = useI18n();
  const page = () => placeholderPages[props.pageId];

  return (
    <div class="page">
      <div class="flex items-start gap-4">
        <div class="size-11 rounded-xl border bg-card flex items-center justify-center shadow-sm">
          <div class={`${page().icon} size-5 text-primary`} />
        </div>
        <div class="min-w-0 flex-1">
          <div class="flex flex-wrap items-center gap-2">
            <h1 class="text-xl font-semibold">{t(page().titleKey)}</h1>
            <Badge variant="outline">{t('placeholder.badge')}</Badge>
          </div>
          <p class="text-muted-foreground mt-1 max-w-2xl">{t(page().descriptionKey)}</p>
        </div>
      </div>

      <Card class="mt-8 border-dashed bg-muted/20">
        <CardContent class="py-14 text-center">
          <div class={`${page().icon} size-9 text-muted-foreground/50 mx-auto mb-4`} />
          <p class="font-medium">{t('placeholder.foundation.title')}</p>
          <p class="text-sm text-muted-foreground mt-1 max-w-md mx-auto">
            {t('placeholder.foundation.description')}
          </p>
        </CardContent>
      </Card>
    </div>
  );
};
