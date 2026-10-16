/* eslint-disable style/max-statements-per-line */
import type { InvoiceBrandingInput } from '../invoicing.types';
import { useParams } from '@solidjs/router';
import { createMutation, useQuery } from '@tanstack/solid-query';
import { createEffect, createSignal } from 'solid-js';
import { useI18n } from '@/modules/i18n/i18n.provider';
import { queryClient } from '@/modules/shared/query/query-client';
import { Button } from '@/modules/ui/components/button';
import { SettingsSection, SettingsSections } from '@/modules/ui/components/settings-section';
import { createToast } from '@/modules/ui/components/sonner';
import { TextArea } from '@/modules/ui/components/textarea';
import { TextField } from '@/modules/ui/components/textfield';
import { FormField } from '../components/catalog-page';
import { fetchInvoiceBranding, saveInvoiceBranding } from '../invoicing.services';

const defaults: InvoiceBrandingInput = { accentColor: '#111827', footerText: null, paymentDetails: null };
export function InvoiceBrandingPage() {
  const { t } = useI18n();
  const params = useParams(); const [value, setValue] = createSignal(defaults); const query = useQuery(() => ({ queryKey: ['invoicing', params.organizationId, 'branding'], queryFn: () => fetchInvoiceBranding({ organizationId: params.organizationId }) }));
  createEffect(() => {
    if (query.data?.branding) {
      setValue({ accentColor: query.data.branding.accentColor, footerText: query.data.branding.footerText, paymentDetails: query.data.branding.paymentDetails });
    }
  });
  const mutation = createMutation(() => ({ mutationFn: () => saveInvoiceBranding({ organizationId: params.organizationId, branding: value() }), onSuccess: async () => {
    await queryClient.invalidateQueries({ queryKey: ['invoicing', params.organizationId, 'branding'] }); createToast({ type: 'success', message: t('invoicing.branding.toast.saved') });
  }, onError: () => createToast({ type: 'error', message: t('invoicing.branding.toast.error') }) }));
  return (
    <main class="page-narrow">
      <div class="page-header">
        <div>
          <h1 class="page-title">{t('invoicing.branding.title')}</h1>
          <p class="page-description">{t('invoicing.branding.description')}</p>
        </div>
      </div>
      <form
        class="space-y-6"
        onSubmit={(e) => {
          e.preventDefault(); mutation.mutate();
        }}
      >
        <SettingsSections>
          <SettingsSection title={t('invoicing.branding.section.style')} description={t('invoicing.branding.section.style.description')}>
            <FormField label={t('invoicing.branding.accent-color')}>
              <div class="flex gap-2">
                <input class="size-9 rounded border" type="color" value={value().accentColor} onInput={e => setValue(v => ({ ...v, accentColor: e.currentTarget.value }))} />
                <TextField value={value().accentColor} pattern="#[0-9a-fA-F]{6}" onInput={e => setValue(v => ({ ...v, accentColor: e.currentTarget.value }))} />
              </div>
            </FormField>
          </SettingsSection>
          <SettingsSection title={t('invoicing.branding.section.content')} description={t('invoicing.branding.section.content.description')}>
            <FormField label={t('invoicing.branding.payment-details')}><TextArea placeholder={t('invoicing.branding.payment-details.placeholder')} value={value().paymentDetails ?? ''} onInput={e => setValue(v => ({ ...v, paymentDetails: e.currentTarget.value || null }))} /></FormField>
            <FormField label={t('invoicing.branding.footer')}><TextArea placeholder={t('invoicing.branding.footer.placeholder')} value={value().footerText ?? ''} onInput={e => setValue(v => ({ ...v, footerText: e.currentTarget.value || null }))} /></FormField>
          </SettingsSection>
          <SettingsSection title={t('invoicing.branding.section.preview')}>
            <div class="max-w-xs">
              <div class="rounded-lg border bg-white p-5 aspect-[1/1.25] text-slate-900 shadow-sm">
                <div class="text-xl font-bold" style={{ color: value().accentColor }}>{t('invoicing.branding.preview.heading')}</div>
                <div class="mt-8 h-1 rounded" style={{ background: value().accentColor }} />
                <div class="mt-6 grid grid-cols-2 gap-5">
                  <div class="space-y-2">
                    <div class="h-2 bg-slate-200 rounded" />
                    <div class="h-2 bg-slate-100 rounded" />
                  </div>
                  <div class="space-y-2">
                    <div class="h-2 bg-slate-200 rounded" />
                    <div class="h-2 bg-slate-100 rounded" />
                  </div>
                </div>
                <div class="mt-8 h-7 rounded" style={{ background: value().accentColor }} />
                <div class="mt-3 space-y-2">
                  <div class="h-2 bg-slate-100 rounded" />
                  <div class="h-2 bg-slate-100 rounded" />
                  <div class="h-2 bg-slate-100 rounded" />
                </div>
                <div class="mt-12 text-[10px] text-slate-400">{value().footerText || t('invoicing.branding.preview.footer')}</div>
              </div>
            </div>
          </SettingsSection>
        </SettingsSections>
        <div class="flex justify-end border-t pt-6"><Button type="submit" isLoading={mutation.isPending}>{t('invoicing.branding.save')}</Button></div>
      </form>
    </main>
  );
}
