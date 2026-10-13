import type { Setter } from 'solid-js';
import type { CustomerInput } from '../invoicing.types';
import { useI18n } from '@/modules/i18n/i18n.provider';
import { TextField } from '@/modules/ui/components/textfield';
import { FormField } from './catalog-page';

export const emptyCustomer = (): CustomerInput => ({ name: '', email: null, taxId: null, addressLine1: null, addressLine2: null, postalCode: null, city: null, region: null, country: null, currency: 'EUR', paymentTermsDays: 30, notes: null });

/** Customer fields laid out for a two-column form grid. */
export function CustomerFormFields(props: { value: CustomerInput; onChange: Setter<CustomerInput>; autofocus?: boolean }) {
  const { t } = useI18n();
  const set = <K extends keyof CustomerInput>(key: K, value: CustomerInput[K]) => props.onChange(current => ({ ...current, [key]: value }));
  const optional = (value: string) => value.trim() || null;

  return (
    <>
      <FormField label={t('invoicing.common.name')} class="sm:col-span-2"><TextField autoFocus={props.autofocus} required value={props.value.name} onInput={event => set('name', event.currentTarget.value)} /></FormField>
      <FormField label={t('invoicing.common.email')}><TextField type="email" value={props.value.email ?? ''} onInput={event => set('email', optional(event.currentTarget.value))} /></FormField>
      <FormField label={t('invoicing.common.tax-id')}><TextField value={props.value.taxId ?? ''} onInput={event => set('taxId', optional(event.currentTarget.value))} /></FormField>
      <FormField label={t('invoicing.common.address')} class="sm:col-span-2"><TextField value={props.value.addressLine1 ?? ''} onInput={event => set('addressLine1', optional(event.currentTarget.value))} /></FormField>
      <FormField label={t('invoicing.common.postal-code')}><TextField value={props.value.postalCode ?? ''} onInput={event => set('postalCode', optional(event.currentTarget.value))} /></FormField>
      <FormField label={t('invoicing.common.city')}><TextField value={props.value.city ?? ''} onInput={event => set('city', optional(event.currentTarget.value))} /></FormField>
      <FormField label={t('invoicing.common.country')}><TextField value={props.value.country ?? ''} onInput={event => set('country', optional(event.currentTarget.value))} /></FormField>
      <FormField label={t('invoicing.customer-form.payment-terms')}><TextField type="number" min="0" value={props.value.paymentTermsDays} onInput={event => set('paymentTermsDays', Number(event.currentTarget.value))} /></FormField>
    </>
  );
}
