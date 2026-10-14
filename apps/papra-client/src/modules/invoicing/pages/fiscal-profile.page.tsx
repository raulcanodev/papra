import type { FiscalProfileInput, InvoiceTemplateId } from '../invoicing.types';
import type { IncomeTaxMethod, VatRegime } from '@/modules/taxes/taxes.types';
import { useParams } from '@solidjs/router';
import { createMutation, useQuery } from '@tanstack/solid-query';
import { createEffect, createSignal, For, Show } from 'solid-js';
import { useI18n } from '@/modules/i18n/i18n.provider';
import { queryClient } from '@/modules/shared/query/query-client';
import { cn } from '@/modules/shared/style/cn';
import { INCOME_TAX_METHOD_LABEL_I18N_KEYS, INCOME_TAX_METHODS, LEGAL_FORM_LABEL_I18N_KEYS, LEGAL_FORMS, VAT_REGIME_LABEL_I18N_KEYS, VAT_REGIMES } from '@/modules/taxes/taxes.constants';
import { Button } from '@/modules/ui/components/button';
import { Card, CardContent } from '@/modules/ui/components/card';
import { SimpleSelect } from '@/modules/ui/components/simple-select';
import { createToast } from '@/modules/ui/components/sonner';
import { TextArea } from '@/modules/ui/components/textarea';
import { TextField } from '@/modules/ui/components/textfield';
import { WITHHOLDING_RATES_BPS } from '../invoicing.constants';
import { fetchFiscalProfile, saveFiscalProfile } from '../invoicing.services';

const emptyProfile = (): FiscalProfileInput => ({ legalName: '', taxId: null, email: null, addressLine1: null, addressLine2: null, postalCode: null, city: null, region: null, country: null, currency: 'EUR', locale: 'es-ES', paymentTermsDays: 30, defaultNotes: null, defaultTerms: null, templateId: 'minimal', defaultWithholdingRateBps: 0, legalForm: null, vatRegime: 'general', incomeTaxMethod: 'direct_simplified', lastCorporateTaxQuotaMinor: null, accountantEmail: null });

export function FiscalProfilePage() {
  const { t } = useI18n();
  const params = useParams();
  const [profile, setProfile] = createSignal(emptyProfile());
  const query = useQuery(() => ({ queryKey: ['invoicing', params.organizationId, 'profile'], queryFn: () => fetchFiscalProfile({ organizationId: params.organizationId }) }));
  createEffect(() => {
    const saved = query.data?.profile;
    if (saved) {
      const { organizationId: _organizationId, createdAt: _createdAt, updatedAt: _updatedAt, ...input } = saved;
      setProfile(input);
    }
  });
  const mutation = createMutation(() => ({
    mutationFn: () => saveFiscalProfile({ organizationId: params.organizationId, profile: profile() }),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['invoicing', params.organizationId, 'profile'] });
      createToast({ type: 'success', message: t('invoicing.fiscal-profile.toast.saved') });
    },
    onError: () => createToast({ type: 'error', message: t('invoicing.fiscal-profile.toast.error') }),
  }));
  const field = <K extends keyof FiscalProfileInput>(key: K, value: FiscalProfileInput[K]) => setProfile(current => ({ ...current, [key]: value }));

  return (
    <main class="page-narrow">
      <div class="page-header">
        <div>
          <h1 class="page-title">{t('invoicing.fiscal-profile.title')}</h1>
          <p class="page-description">{t('invoicing.fiscal-profile.description')}</p>
        </div>
      </div>
      <Show when={!query.isLoading}>
        <form
          onSubmit={(event) => {
            event.preventDefault();
            if (profile().legalName.trim()) {
              mutation.mutate();
            }
          }}
          class="space-y-5"
        >
          <Card>
            <CardContent class="pt-6 grid gap-4 sm:grid-cols-2">
              <label class="text-sm font-medium sm:col-span-2">
                {t('invoicing.fiscal-profile.legal-name')}
                <TextField class="mt-1.5" value={profile().legalName} onInput={event => field('legalName', event.currentTarget.value)} autofocus />
              </label>
              <label class="text-sm font-medium">
                {t('invoicing.common.tax-id')}
                <TextField class="mt-1.5" value={profile().taxId ?? ''} onInput={event => field('taxId', event.currentTarget.value || null)} />
              </label>
              <label class="text-sm font-medium">
                {t('invoicing.fiscal-profile.billing-email')}
                <TextField class="mt-1.5" type="email" value={profile().email ?? ''} onInput={event => field('email', event.currentTarget.value || null)} />
              </label>
              <label class="text-sm font-medium sm:col-span-2">
                {t('invoicing.common.address')}
                <TextField class="mt-1.5" value={profile().addressLine1 ?? ''} onInput={event => field('addressLine1', event.currentTarget.value || null)} />
              </label>
              <label class="text-sm font-medium">
                {t('invoicing.common.postal-code')}
                <TextField class="mt-1.5" value={profile().postalCode ?? ''} onInput={event => field('postalCode', event.currentTarget.value || null)} />
              </label>
              <label class="text-sm font-medium">
                {t('invoicing.common.city')}
                <TextField class="mt-1.5" value={profile().city ?? ''} onInput={event => field('city', event.currentTarget.value || null)} />
              </label>
              <label class="text-sm font-medium">
                {t('invoicing.common.region')}
                <TextField class="mt-1.5" value={profile().region ?? ''} onInput={event => field('region', event.currentTarget.value || null)} />
              </label>
              <label class="text-sm font-medium">
                {t('invoicing.common.country')}
                <TextField class="mt-1.5" value={profile().country ?? ''} onInput={event => field('country', event.currentTarget.value || null)} />
              </label>
            </CardContent>
          </Card>
          <Card>
            <CardContent class="pt-6 grid gap-4 sm:grid-cols-3">
              <label class="text-sm font-medium">
                {t('invoicing.common.currency')}
                <TextField class="mt-1.5 uppercase" maxlength={3} value={profile().currency} onInput={event => field('currency', event.currentTarget.value.toUpperCase())} />
              </label>
              <label class="text-sm font-medium">
                {t('invoicing.fiscal-profile.payment-terms')}
                <TextField class="mt-1.5" type="number" min="0" max="365" value={profile().paymentTermsDays} onInput={event => field('paymentTermsDays', Number(event.currentTarget.value))} />
              </label>
              <div class="text-sm font-medium">
                {t('invoicing.fiscal-profile.default-withholding')}
                <SimpleSelect
                  class="mt-1.5"
                  value={String(profile().defaultWithholdingRateBps)}
                  onChange={value => field('defaultWithholdingRateBps', Number(value))}
                  options={WITHHOLDING_RATES_BPS.map(rateBps => ({ value: String(rateBps), label: rateBps === 0 ? t('invoicing.editor.withholding.none') : `${rateBps / 100} %` }))}
                />
                <p class="mt-1 text-xs font-normal text-muted-foreground">{t('invoicing.fiscal-profile.default-withholding.description')}</p>
              </div>
              <div class="text-sm font-medium">
                {t('invoicing.common.pdf-style')}
                <SimpleSelect
                  class="mt-1.5"
                  value={profile().templateId}
                  onChange={value => field('templateId', value as InvoiceTemplateId)}
                  options={[
                    { value: 'minimal', label: t('invoicing.common.pdf-style.minimal') },
                    { value: 'classic', label: t('invoicing.common.pdf-style.classic') },
                  ]}
                />
              </div>
              <label class="text-sm font-medium sm:col-span-3">
                {t('invoicing.fiscal-profile.default-notes')}
                <TextArea class="mt-1.5" value={profile().defaultNotes ?? ''} onInput={event => field('defaultNotes', event.currentTarget.value || null)} />
              </label>
              <label class="text-sm font-medium sm:col-span-3">
                {t('invoicing.fiscal-profile.default-terms')}
                <TextArea class="mt-1.5" value={profile().defaultTerms ?? ''} onInput={event => field('defaultTerms', event.currentTarget.value || null)} />
              </label>
            </CardContent>
          </Card>
          {/* What the quarterly taxes estimation needs to know about the business */}
          <Card>
            <CardContent class="pt-6 grid gap-4 sm:grid-cols-2">
              <div class="sm:col-span-2">
                <p class="font-medium">{t('taxes.profile.title')}</p>
                <p class="text-sm text-muted-foreground">{t('taxes.profile.description')}</p>
              </div>
              <div class="text-sm font-medium sm:col-span-2">
                {t('taxes.profile.legal-form')}
                <div class="mt-1.5 inline-flex w-full rounded-lg border p-0.5 sm:w-auto" role="radiogroup" aria-label={t('taxes.profile.legal-form')}>
                  <For each={LEGAL_FORMS}>
                    {legalForm => (
                      <button
                        type="button"
                        role="radio"
                        aria-checked={profile().legalForm === legalForm}
                        class={cn('flex-1 rounded-md px-3 py-1.5 text-sm font-normal transition-colors sm:flex-none', profile().legalForm === legalForm ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:text-foreground')}
                        onClick={() => field('legalForm', legalForm)}
                      >
                        {t(LEGAL_FORM_LABEL_I18N_KEYS[legalForm])}
                      </button>
                    )}
                  </For>
                </div>
              </div>
              <div class="text-sm font-medium">
                {t('taxes.profile.vat-regime')}
                <SimpleSelect class="mt-1.5" value={profile().vatRegime} onChange={value => field('vatRegime', value as VatRegime)} options={VAT_REGIMES.map(value => ({ value, label: t(VAT_REGIME_LABEL_I18N_KEYS[value]) }))} />
              </div>
              <Show when={profile().legalForm === 'self_employed'}>
                <div class="text-sm font-medium">
                  {t('taxes.profile.income-tax-method')}
                  <SimpleSelect class="mt-1.5" value={profile().incomeTaxMethod} onChange={value => field('incomeTaxMethod', value as IncomeTaxMethod)} options={INCOME_TAX_METHODS.map(value => ({ value, label: t(INCOME_TAX_METHOD_LABEL_I18N_KEYS[value]) }))} />
                </div>
              </Show>
              <Show when={profile().legalForm === 'company'}>
                <label class="text-sm font-medium">
                  {t('taxes.profile.last-corporate-tax-quota')}
                  <TextField class="mt-1.5" type="number" min="0" step="0.01" value={profile().lastCorporateTaxQuotaMinor === null ? '' : profile().lastCorporateTaxQuotaMinor! / 100} onInput={event => field('lastCorporateTaxQuotaMinor', event.currentTarget.value === '' ? null : Math.round(Number(event.currentTarget.value) * 100))} />
                  <p class="mt-1 text-xs font-normal text-muted-foreground">{t('taxes.profile.last-corporate-tax-quota.description')}</p>
                </label>
              </Show>
              <label class="text-sm font-medium">
                {t('taxes.profile.accountant-email')}
                <TextField class="mt-1.5" type="email" value={profile().accountantEmail ?? ''} onInput={event => field('accountantEmail', event.currentTarget.value.trim() || null)} />
              </label>
            </CardContent>
          </Card>
          <div class="flex justify-end"><Button type="submit" disabled={!profile().legalName.trim()} isLoading={mutation.isPending}>{t('invoicing.fiscal-profile.save')}</Button></div>
        </form>
      </Show>
    </main>
  );
}
