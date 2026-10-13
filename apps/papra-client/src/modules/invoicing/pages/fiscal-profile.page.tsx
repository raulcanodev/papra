import type { FiscalProfileInput, InvoiceTemplateId } from '../invoicing.types';
import { useParams } from '@solidjs/router';
import { createMutation, useQuery } from '@tanstack/solid-query';
import { createEffect, createSignal, Show } from 'solid-js';
import { useI18n } from '@/modules/i18n/i18n.provider';
import { queryClient } from '@/modules/shared/query/query-client';
import { Button } from '@/modules/ui/components/button';
import { Card, CardContent } from '@/modules/ui/components/card';
import { createToast } from '@/modules/ui/components/sonner';
import { TextArea } from '@/modules/ui/components/textarea';
import { TextField } from '@/modules/ui/components/textfield';
import { selectClass } from '../components/catalog-page';
import { fetchFiscalProfile, saveFiscalProfile } from '../invoicing.services';

const emptyProfile = (): FiscalProfileInput => ({ legalName: '', taxId: null, email: null, addressLine1: null, addressLine2: null, postalCode: null, city: null, region: null, country: null, currency: 'EUR', locale: 'es-ES', paymentTermsDays: 30, defaultNotes: null, defaultTerms: null, templateId: 'minimal' });

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
              <label class="text-sm font-medium">
                {t('invoicing.common.pdf-style')}
                <select class={`${selectClass} mt-1.5`} value={profile().templateId} onChange={event => field('templateId', event.currentTarget.value as InvoiceTemplateId)}>
                  <option value="minimal">{t('invoicing.common.pdf-style.minimal')}</option>
                  <option value="classic">{t('invoicing.common.pdf-style.classic')}</option>
                </select>
              </label>
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
          <div class="flex justify-end"><Button type="submit" disabled={!profile().legalName.trim()} isLoading={mutation.isPending}>{t('invoicing.fiscal-profile.save')}</Button></div>
        </form>
      </Show>
    </main>
  );
}
