import type { Setter } from 'solid-js';
import type { ContactInput, ContactKind, ContactRole } from '../contacts.types';
import { For, Show } from 'solid-js';
import { useI18n } from '@/modules/i18n/i18n.provider';
import { FormField } from '@/modules/invoicing/components/catalog-page';
import { cn } from '@/modules/shared/style/cn';
import { TextField } from '@/modules/ui/components/textfield';
import { CONTACT_ROLE_BADGE_CLASSES, CONTACT_ROLE_FLAGS, CONTACT_ROLE_LABEL_I18N_KEYS, CONTACT_ROLES, hasContactRole } from '../contacts.constants';

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
    currency: 'EUR',
    paymentTermsDays: 30,
    notes: null,
    isCustomer: false,
    isSupplier: false,
    isSalesRepresentative: false,
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
    currency: contact.currency,
    paymentTermsDays: contact.paymentTermsDays,
    notes: contact.notes,
    isCustomer: contact.isCustomer,
    isSupplier: contact.isSupplier,
    isSalesRepresentative: contact.isSalesRepresentative,
  });
}

const KINDS: { kind: ContactKind; icon: string; labelKey: 'contacts.form.kind.company' | 'contacts.form.kind.person' }[] = [
  { kind: 'company', icon: 'i-tabler-building', labelKey: 'contacts.form.kind.company' },
  { kind: 'person', icon: 'i-tabler-user', labelKey: 'contacts.form.kind.person' },
];

/** Contact fields laid out for a two-column form grid */
export function ContactFormFields(props: {
  value: ContactInput;
  onChange: Setter<ContactInput>;
  autofocus?: boolean;
  /** Roles that cannot be unset from this form (the customer role when creating a customer from an invoice) */
  lockedRoles?: ContactRole[];
}) {
  const { t } = useI18n();
  const set = <K extends keyof ContactInput>(key: K, value: ContactInput[K]) => props.onChange(current => ({ ...current, [key]: value }));
  const optional = (value: string) => value.trim() || null;
  const isLocked = (role: ContactRole) => props.lockedRoles?.includes(role) ?? false;
  const hasBillingTerms = () => props.value.isCustomer || props.value.isSupplier;

  return (
    <>
      <div class="flex flex-wrap items-center justify-between gap-3 sm:col-span-2">
        <div class="inline-flex rounded-lg border p-0.5" role="radiogroup" aria-label={t('contacts.form.kind.label')}>
          <For each={KINDS}>
            {({ kind, icon, labelKey }) => (
              <button
                type="button"
                role="radio"
                aria-checked={props.value.kind === kind}
                class={cn('flex items-center gap-1.5 rounded-md px-3 py-1.5 text-sm transition-colors', props.value.kind === kind ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:text-foreground')}
                onClick={() => set('kind', kind)}
              >
                <div class={cn(icon, 'size-4')} />
                {t(labelKey)}
              </button>
            )}
          </For>
        </div>

        <div class="flex flex-wrap gap-1.5" role="group" aria-label={t('contacts.form.roles.label')}>
          <For each={CONTACT_ROLES}>
            {(role) => {
              const isActive = () => hasContactRole({ contact: props.value, role });
              return (
                <button
                  type="button"
                  aria-pressed={isActive()}
                  disabled={isLocked(role)}
                  class={cn(
                    'flex items-center gap-1 rounded-full border px-2.5 py-1 text-xs font-medium transition-colors disabled:cursor-not-allowed',
                    isActive() ? cn('border-transparent', CONTACT_ROLE_BADGE_CLASSES[role]) : 'text-muted-foreground hover:bg-accent',
                  )}
                  onClick={() => set(CONTACT_ROLE_FLAGS[role], !isActive())}
                >
                  <div class={cn(isActive() ? 'i-tabler-check' : 'i-tabler-plus', 'size-3')} />
                  {t(CONTACT_ROLE_LABEL_I18N_KEYS[role])}
                </button>
              );
            }}
          </For>
        </div>
      </div>

      <FormField label={props.value.kind === 'company' ? t('contacts.form.company-name') : t('contacts.form.person-name')} class="sm:col-span-2">
        <TextField autoFocus={props.autofocus} required value={props.value.name} onInput={event => set('name', event.currentTarget.value)} />
      </FormField>
      <FormField label={t('invoicing.common.email')}><TextField type="email" value={props.value.email ?? ''} onInput={event => set('email', optional(event.currentTarget.value))} /></FormField>
      <FormField label={t('invoicing.common.phone')}><TextField type="tel" value={props.value.phone ?? ''} onInput={event => set('phone', optional(event.currentTarget.value))} /></FormField>
      <FormField label={t('invoicing.common.tax-id')}><TextField value={props.value.taxId ?? ''} onInput={event => set('taxId', optional(event.currentTarget.value))} /></FormField>
      <FormField label={t('invoicing.common.country')}><TextField value={props.value.country ?? ''} onInput={event => set('country', optional(event.currentTarget.value))} /></FormField>
      <FormField label={t('invoicing.common.address')} class="sm:col-span-2"><TextField value={props.value.addressLine1 ?? ''} onInput={event => set('addressLine1', optional(event.currentTarget.value))} /></FormField>
      <FormField label={t('invoicing.common.postal-code')}><TextField value={props.value.postalCode ?? ''} onInput={event => set('postalCode', optional(event.currentTarget.value))} /></FormField>
      <FormField label={t('invoicing.common.city')}><TextField value={props.value.city ?? ''} onInput={event => set('city', optional(event.currentTarget.value))} /></FormField>
      <Show when={hasBillingTerms()}>
        <FormField label={t('invoicing.customer-form.payment-terms')}><TextField type="number" min="0" max="365" value={props.value.paymentTermsDays} onInput={event => set('paymentTermsDays', Number(event.currentTarget.value))} /></FormField>
      </Show>
    </>
  );
}
