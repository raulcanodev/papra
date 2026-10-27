import type { Setter } from 'solid-js';
import type { ContactInput } from '../contacts.types';
import { Show } from 'solid-js';
import { useI18n } from '@/modules/i18n/i18n.provider';
import { FormField } from '@/modules/invoicing/components/catalog-page';
import { EntityIconPicker } from '@/modules/ui/components/entity-icon';
import { SimpleCheckbox } from '@/modules/ui/components/simple-checkbox';
import { TextField } from '@/modules/ui/components/textfield';
import { getContactFallbackIcon } from '../contacts.constants';

export function emptyContact(overrides: Partial<ContactInput> = {}): ContactInput {
  return {
    kind: 'company',
    name: '',
    email: null,
    phone: null,
    taxId: null,
    addressLine1: null,
    addressLine2: null,
    postalCode: null,
    city: null,
    region: null,
    country: null,
    bankAccount: null,
    currency: 'EUR',
    paymentTermsDays: null,
    notes: null,
    icon: null,
    iconColor: null,
    isCustomer: false,
    isSupplier: false,
    isSalesRepresentative: false,
    equivalenceSurcharge: false,
    ...overrides,
  };
}

export function toContactInput(contact: ContactInput): ContactInput {
  return emptyContact({
    kind: contact.kind,
    name: contact.name,
    email: contact.email,
    phone: contact.phone,
    taxId: contact.taxId,
    addressLine1: contact.addressLine1,
    addressLine2: contact.addressLine2,
    postalCode: contact.postalCode,
    city: contact.city,
    region: contact.region,
    country: contact.country,
    bankAccount: contact.bankAccount,
    currency: contact.currency,
    paymentTermsDays: contact.paymentTermsDays,
    notes: contact.notes,
    icon: contact.icon ?? null,
    iconColor: contact.iconColor ?? null,
    isCustomer: contact.isCustomer,
    isSupplier: contact.isSupplier,
    isSalesRepresentative: contact.isSalesRepresentative,
    equivalenceSurcharge: contact.equivalenceSurcharge ?? false,
  });
}

/** Contact fields laid out for a two-column form grid, the kind and the roles come from the page it is used in */
export function ContactFormFields(props: {
  value: ContactInput;
  onChange: Setter<ContactInput>;
  autofocus?: boolean;
}) {
  const { t } = useI18n();
  const set = <K extends keyof ContactInput>(key: K, value: ContactInput[K]) => props.onChange(current => ({ ...current, [key]: value }));
  const optional = (value: string) => value.trim() || null;
  const hasBillingTerms = () => props.value.isCustomer || props.value.isSupplier;

  return (
    <>
      {/* The picker stays outside the label: a click on the label text must focus the name, not open the picker */}
      <div class="flex items-end gap-3 sm:col-span-2">
        <EntityIconPicker
          value={{ icon: props.value.icon ?? null, iconColor: props.value.iconColor ?? null }}
          onChange={appearance => props.onChange(current => ({ ...current, ...appearance }))}
          fallback={getContactFallbackIcon({ contact: props.value })}
        />
        <FormField label={props.value.kind === 'company' ? t('contacts.form.name') : t('contacts.form.person-name')} class="flex-1">
          <TextField autoFocus={props.autofocus} required value={props.value.name} onInput={event => set('name', event.currentTarget.value)} />
        </FormField>
      </div>
      <FormField label={t('invoicing.common.email')}><TextField type="email" value={props.value.email ?? ''} onInput={event => set('email', optional(event.currentTarget.value))} /></FormField>
      <FormField label={t('invoicing.common.phone')}><TextField type="tel" value={props.value.phone ?? ''} onInput={event => set('phone', optional(event.currentTarget.value))} /></FormField>
      <FormField label={t('invoicing.common.tax-id')}><TextField value={props.value.taxId ?? ''} onInput={event => set('taxId', optional(event.currentTarget.value))} /></FormField>
      <FormField label={t('invoicing.common.country')}><TextField value={props.value.country ?? ''} onInput={event => set('country', optional(event.currentTarget.value))} /></FormField>
      <FormField label={t('invoicing.common.address')} class="sm:col-span-2"><TextField value={props.value.addressLine1 ?? ''} onInput={event => set('addressLine1', optional(event.currentTarget.value))} /></FormField>
      <FormField label={t('invoicing.common.postal-code')}><TextField value={props.value.postalCode ?? ''} onInput={event => set('postalCode', optional(event.currentTarget.value))} /></FormField>
      <FormField label={t('invoicing.common.city')}><TextField value={props.value.city ?? ''} onInput={event => set('city', optional(event.currentTarget.value))} /></FormField>
      <FormField label={t('contacts.form.bank-account')} class="sm:col-span-2">
        <TextField value={props.value.bankAccount ?? ''} placeholder={t('contacts.form.bank-account.placeholder')} autocomplete="off" spellcheck={false} class="font-mono" onInput={event => set('bankAccount', optional(event.currentTarget.value))} />
      </FormField>
      <Show when={hasBillingTerms()}>
        <FormField label={t('invoicing.customer-form.payment-terms')}><TextField type="number" min="0" max="365" value={props.value.paymentTermsDays ?? ''} onInput={event => set('paymentTermsDays', event.currentTarget.value === '' ? null : Number(event.currentTarget.value))} /></FormField>
      </Show>
      <Show when={props.value.isCustomer}>
        <div class="sm:col-span-2">
          <SimpleCheckbox checked={props.value.equivalenceSurcharge ?? false} onChange={checked => set('equivalenceSurcharge', checked)} label={t('contacts.form.equivalence-surcharge')} />
          <p class="mt-1 pl-6 text-xs text-muted-foreground">{t('contacts.form.equivalence-surcharge.description')}</p>
        </div>
      </Show>
    </>
  );
}
