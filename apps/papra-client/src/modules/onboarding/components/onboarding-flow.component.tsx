import type { Component } from 'solid-js';
import type { OnboardingStatus } from '../onboarding.services';
import type { OnboardingFlowId, OnboardingStepId } from '../onboarding.steps';
import type { FiscalProfileInput, InvoiceTemplateId } from '@/modules/invoicing/invoicing.types';
import type { OrganizationMemberRole } from '@/modules/organizations/organizations.types';
import { safely } from '@corentinth/chisels';
import { useNavigate } from '@solidjs/router';
import { useQuery } from '@tanstack/solid-query';
import { createSignal, For, Index, Match, onMount, Show, Switch } from 'solid-js';
import { createStore } from 'solid-js/store';
import { useI18n } from '@/modules/i18n/i18n.provider';
import { acceptInvitation, fetchInvitations, rejectInvitation } from '@/modules/invitations/invitations.services';
import { createInvoiceSeries, createTaxRate, fetchFiscalProfile, fetchInvoiceBranding, fetchInvoiceSeries, fetchTaxRates, saveFiscalProfile, saveInvoiceBranding, updateInvoiceSeries, updateTaxRate } from '@/modules/invoicing/invoicing.services';
import { createOrganization, fetchOrganization, inviteOrganizationMember, updateOrganization } from '@/modules/organizations/organizations.services';
import { useI18nApiErrors } from '@/modules/shared/http/composables/i18n-api-errors';
import { isHttpErrorWithCode } from '@/modules/shared/http/http-errors';
import { queryClient } from '@/modules/shared/query/query-client';
import { cn } from '@/modules/shared/style/cn';
import { Button } from '@/modules/ui/components/button';
import { SimpleCheckbox } from '@/modules/ui/components/simple-checkbox';
import { SimpleSelect } from '@/modules/ui/components/simple-select';
import { TextArea } from '@/modules/ui/components/textarea';
import { TextField } from '@/modules/ui/components/textfield';
import { UserSettingsDropdown } from '@/modules/users/components/user-settings.component';
import { useCurrentUser } from '@/modules/users/composables/useCurrentUser';
import { updateUser } from '@/modules/users/users.services';
import { updateOrganizationOnboarding, updateUserOnboarding } from '../onboarding.services';
import { getFlowSteps, getResumeStepIndex } from '../onboarding.steps';
import { ChoiceCards, ChoiceChips, OnboardingField } from './onboarding-fields';

type BusinessType = 'freelancer' | 'company' | 'other';
type TaxRateChoice = { name: string; rateBps: number; selected: boolean };
type Invite = { email: string; role: Exclude<OrganizationMemberRole, 'owner'> };

const ACCENT_COLORS = ['#111827', '#2563EB', '#0D9488', '#16A34A', '#CA8A04', '#EA580C', '#DC2626', '#DB2777', '#7C3AED'];
const CURRENCIES = ['EUR', 'USD', 'GBP', 'CHF', 'MXN', 'ARS', 'COP', 'CLP'];
const PAYMENT_TERMS = [0, 15, 30, 45, 60, 90];

const formatSeriesNumber = ({ prefix, nextNumber, padding }: { prefix: string; nextNumber: number; padding: number }) => `${prefix}${String(nextNumber).padStart(padding, '0')}`;
const nullable = (value: string) => value.trim() || null;

/** Tiny sketch of an invoice layout, to compare PDF styles. */
const InvoiceThumbnail: Component<{ variant: InvoiceTemplateId; accentColor: string }> = (props) => {
  return (
    <div class="h-24 rounded-md border bg-white p-2.5 shadow-xs dark:bg-neutral-100">
      <Show
        when={props.variant === 'classic'}
        fallback={(
          <>
            <div class="h-1.5 w-10 rounded-full" style={{ background: props.accentColor }} />
            <div class="mt-3 space-y-1">
              <div class="h-1 w-full rounded-full bg-neutral-200" />
              <div class="h-1 w-5/6 rounded-full bg-neutral-200" />
              <div class="h-1 w-4/6 rounded-full bg-neutral-200" />
            </div>
            <div class="mt-3 ml-auto h-1.5 w-8 rounded-full bg-neutral-300" />
          </>
        )}
      >
        <div class="-mx-2.5 -mt-2.5 h-5 rounded-t-md" style={{ background: props.accentColor }} />
        <div class="mt-2 grid grid-cols-3 gap-1">
          <div class="h-1 rounded-full bg-neutral-300" />
          <div class="h-1 rounded-full bg-neutral-300" />
          <div class="h-1 rounded-full bg-neutral-300" />
          <div class="h-1 rounded-full bg-neutral-200" />
          <div class="h-1 rounded-full bg-neutral-200" />
          <div class="h-1 rounded-full bg-neutral-200" />
        </div>
        <div class="mt-3 ml-auto h-3 w-12 rounded-sm" style={{ background: props.accentColor, opacity: 0.85 }} />
      </Show>
    </div>
  );
};

/** What an invoice will look like with the branding chosen so far. */
const InvoicePreview: Component<{ accentColor: string; companyName: string; taxId: string; number: string; paymentDetails: string; footerText: string }> = (props) => {
  const { t } = useI18n();

  return (
    <div class="rounded-xl border bg-white p-6 text-neutral-900 shadow-sm">
      <div class="flex items-start justify-between gap-4">
        <div>
          <p class="text-base font-bold" style={{ color: props.accentColor }}>{props.companyName || t('onboarding.branding.preview.company')}</p>
          <Show when={props.taxId}>
            <p class="text-xs text-neutral-500">{props.taxId}</p>
          </Show>
        </div>
        <div class="text-right">
          <p class="text-xs uppercase tracking-wide text-neutral-500">{t('onboarding.branding.preview.invoice')}</p>
          <p class="font-mono text-sm font-semibold">{props.number}</p>
        </div>
      </div>
      <div class="mt-5 h-0.5 rounded" style={{ background: props.accentColor }} />
      <div class="mt-4 space-y-1.5">
        <div class="h-1.5 w-full rounded-full bg-neutral-100" />
        <div class="h-1.5 w-5/6 rounded-full bg-neutral-100" />
        <div class="h-1.5 w-4/6 rounded-full bg-neutral-100" />
      </div>
      <div class="mt-4 flex justify-end">
        <span class="rounded px-3 py-1 text-xs font-semibold text-white" style={{ background: props.accentColor }}>{t('onboarding.branding.preview.total')}</span>
      </div>
      <Show when={props.paymentDetails}>
        <p class="mt-4 whitespace-pre-line text-xs text-neutral-600">{props.paymentDetails}</p>
      </Show>
      <Show when={props.footerText}>
        <p class="mt-3 border-t pt-3 text-center text-[11px] text-neutral-500">{props.footerText}</p>
      </Show>
    </div>
  );
};

export const OnboardingFlow: Component<{
  flow: OnboardingFlowId;
  initialStep?: string | null;
  /** The company being set up, when the company step already ran. */
  initialOrganizationId?: string | null;
}> = (props) => {
  const { t, getLocale } = useI18n();
  const { getErrorMessage } = useI18nApiErrors({ t });
  const { user, refreshCurrentUser } = useCurrentUser();
  const navigate = useNavigate();

  const steps = getFlowSteps(props.flow);
  const [organizationId, setOrganizationId] = createSignal(props.initialOrganizationId ?? null);
  // Steps about the company need it to exist: without one, resume at the step that creates it.
  const resumeIndex = () => {
    const index = getResumeStepIndex({ flow: props.flow, stepId: props.initialStep });
    const companyIndex = steps.findIndex(step => step.id === 'company');

    return !organizationId() && companyIndex !== -1 && index > companyIndex ? companyIndex : index;
  };
  const [index, setIndex] = createSignal(resumeIndex());
  const [isSaving, setIsSaving] = createSignal(false);
  const [isLoadingCompany, setIsLoadingCompany] = createSignal(Boolean(organizationId()));
  const [error, setError] = createSignal('');
  const [finished, setFinished] = createSignal(false);
  const step = () => steps[index()]!;

  const [values, setValues] = createStore({
    name: user.name ?? '',
    companyName: '',
    businessType: 'company' as BusinessType,
    legalName: '',
    taxId: '',
    billingEmail: user.email,
    addressLine1: '',
    addressLine2: '',
    postalCode: '',
    city: '',
    region: '',
    country: t('onboarding.defaults.country'),
    currency: 'EUR',
    locale: getLocale() === 'es' ? 'es-ES' : 'en-US',
    paymentTermsDays: 30,
    templateId: 'minimal' as InvoiceTemplateId,
    defaultNotes: null as string | null,
    defaultTerms: null as string | null,
    taxRates: [
      { name: t('onboarding.taxes.presets.general'), rateBps: 2100, selected: true },
      { name: t('onboarding.taxes.presets.reduced'), rateBps: 1000, selected: false },
      { name: t('onboarding.taxes.presets.super-reduced'), rateBps: 400, selected: false },
      { name: t('onboarding.taxes.presets.exempt'), rateBps: 0, selected: false },
    ] as TaxRateChoice[],
    defaultRateBps: 2100,
    customTaxName: '',
    customTaxRate: '',
    seriesPrefix: `F${new Date().getFullYear()}-`,
    seriesNextNumber: 1,
    seriesPadding: 4,
    accentColor: ACCENT_COLORS[0]!,
    paymentDetails: '',
    footerText: '',
    invites: [{ email: '', role: 'member' }] as Invite[],
  });

  const invitationsQuery = useQuery(() => ({
    queryKey: ['invitations'],
    queryFn: fetchInvitations,
    enabled: props.flow === 'invited-user',
  }));
  const [joinedOrganizations, setJoinedOrganizations] = createSignal<{ id: string; name: string }[]>([]);

  /** Fills the company steps with what was already saved, when resuming. */
  async function loadCompany(id: string) {
    setIsLoadingCompany(true);
    // Each part loads on its own: what fails is simply asked again.
    const [[organizationResult], [profileResult], [brandingResult], [seriesResult], [taxRatesResult]] = await Promise.all([
      safely(fetchOrganization({ organizationId: id })),
      safely(fetchFiscalProfile({ organizationId: id })),
      safely(fetchInvoiceBranding({ organizationId: id })),
      safely(fetchInvoiceSeries({ organizationId: id })),
      safely(fetchTaxRates({ organizationId: id })),
    ]);
    setIsLoadingCompany(false);

    const profile = profileResult?.profile;
    const branding = brandingResult?.branding;
    const series = seriesResult?.series ?? [];
    const taxRates = taxRatesResult?.taxRates ?? [];

    if (organizationResult) {
      setValues({ companyName: organizationResult.organization.name });
    }

    if (profile) {
      setValues({
        legalName: profile.legalName,
        taxId: profile.taxId ?? '',
        billingEmail: profile.email ?? user.email,
        addressLine1: profile.addressLine1 ?? '',
        addressLine2: profile.addressLine2 ?? '',
        postalCode: profile.postalCode ?? '',
        city: profile.city ?? '',
        region: profile.region ?? '',
        country: profile.country ?? values.country,
        currency: profile.currency,
        locale: profile.locale,
        paymentTermsDays: profile.paymentTermsDays,
        templateId: profile.templateId,
        defaultNotes: profile.defaultNotes,
        defaultTerms: profile.defaultTerms,
      });
    }

    if (branding) {
      setValues({ accentColor: branding.accentColor, paymentDetails: branding.paymentDetails ?? '', footerText: branding.footerText ?? '' });
    }

    const defaultSeries = series.find(item => item.isDefault && !item.archivedAt);
    // The series created automatically keeps the suggested prefix until someone changes it.
    if (defaultSeries && defaultSeries.prefix !== 'INV-') {
      setValues({ seriesPrefix: defaultSeries.prefix, seriesNextNumber: defaultSeries.nextNumber, seriesPadding: defaultSeries.padding });
    }

    const activeRates = taxRates.filter(rate => !rate.archivedAt);
    if (activeRates.length > 0) {
      const presets = values.taxRates.map(preset => ({ ...preset, selected: activeRates.some(rate => rate.rateBps === preset.rateBps) }));
      const others = activeRates
        .filter(rate => !presets.some(preset => preset.rateBps === rate.rateBps))
        .map(rate => ({ name: rate.name, rateBps: rate.rateBps, selected: true }));
      setValues({
        taxRates: [...presets, ...others],
        defaultRateBps: activeRates.find(rate => rate.isDefault)?.rateBps ?? values.defaultRateBps,
      });
    }
  }

  onMount(() => {
    const id = organizationId();
    if (id) {
      void loadCompany(id);
    }
  });

  const fiscalProfile = (): FiscalProfileInput => ({
    // Not asked during onboarding, set later from the fiscal profile settings
    defaultWithholdingRateBps: 0,
    vatRegime: 'general',
    incomeTaxMethod: 'direct_simplified',
    lastCorporateTaxQuotaMinor: null,
    accountantEmail: null,
    // The business type answered at the start decides the quarterly taxes models
    legalForm: values.businessType === 'freelancer' ? 'self_employed' : values.businessType === 'company' ? 'company' : null,
    legalName: values.legalName.trim() || values.companyName.trim(),
    taxId: nullable(values.taxId),
    email: nullable(values.billingEmail),
    addressLine1: nullable(values.addressLine1),
    addressLine2: nullable(values.addressLine2),
    postalCode: nullable(values.postalCode),
    city: nullable(values.city),
    region: nullable(values.region),
    country: nullable(values.country),
    currency: values.currency,
    locale: values.locale,
    paymentTermsDays: values.paymentTermsDays,
    defaultNotes: values.defaultNotes,
    defaultTerms: values.defaultTerms,
    templateId: values.templateId,
  });

  const requireOrganizationId = () => {
    const id = organizationId();
    if (!id) {
      throw new Error('The company must be created before this step');
    }
    return id;
  };

  /** Saves what the step asks for. Returns an error message to stay on the step. */
  const saveStep: Partial<Record<OnboardingStepId, () => Promise<string | void>>> = {
    profile: async () => {
      if (!values.name.trim()) {
        return t('onboarding.profile.name.required');
      }
      if (values.name.trim() !== user.name) {
        await updateUser({ name: values.name.trim() });
        await refreshCurrentUser();
      }
    },
    company: async () => {
      const name = values.companyName.trim();
      if (name.length < 3) {
        return t('onboarding.company.name.required');
      }

      const id = organizationId();
      if (id) {
        await updateOrganization({ organizationId: id, name });
      } else {
        const [result, error] = await safely(createOrganization({ name }));
        if (isHttpErrorWithCode({ error, code: 'user.max_organization_count_reached' })) {
          return t('onboarding.company.error.max-count-reached');
        }
        if (error) {
          throw error;
        }
        setOrganizationId(result.organization.id);
        // A reload resumes setting up this company instead of creating another one.
        if (props.flow === 'new-organization') {
          window.history.replaceState(null, '', `/organizations/${result.organization.id}/setup`);
        }
      }

      // Freelancers invoice under their own name.
      if (!values.legalName) {
        setValues({ legalName: values.businessType === 'freelancer' ? values.name || user.name || '' : name });
      }
      await queryClient.invalidateQueries({ queryKey: ['organizations'] });
    },
    fiscal: async () => {
      if (!values.legalName.trim()) {
        return t('onboarding.fiscal.legal-name.required');
      }
      await saveFiscalProfile({ organizationId: requireOrganizationId(), profile: fiscalProfile() });
    },
    address: async () => {
      await saveFiscalProfile({ organizationId: requireOrganizationId(), profile: fiscalProfile() });
    },
    invoicing: async () => {
      await saveFiscalProfile({ organizationId: requireOrganizationId(), profile: fiscalProfile() });
    },
    taxes: async () => {
      const id = requireOrganizationId();
      const selected = values.taxRates.filter(rate => rate.selected);
      if (selected.length === 0) {
        return t('onboarding.taxes.required');
      }
      const defaultRateBps = selected.some(rate => rate.rateBps === values.defaultRateBps) ? values.defaultRateBps : selected[0]!.rateBps;
      const { taxRates: existing } = await fetchTaxRates({ organizationId: id });

      for (const rate of selected) {
        const isDefault = rate.rateBps === defaultRateBps;
        const current = existing.find(item => item.rateBps === rate.rateBps && !item.archivedAt);

        if (!current) {
          await createTaxRate({ organizationId: id, taxRate: { name: rate.name, rateBps: rate.rateBps, isDefault } });
        } else if (current.isDefault !== isDefault) {
          await updateTaxRate({ organizationId: id, taxRateId: current.id, taxRate: { name: current.name, rateBps: current.rateBps, isDefault } });
        }
      }
      await queryClient.invalidateQueries({ queryKey: ['invoicing', id] });
    },
    series: async () => {
      const id = requireOrganizationId();
      if (!values.seriesPrefix.trim()) {
        return t('onboarding.series.prefix.required');
      }
      const input = { prefix: values.seriesPrefix.trim(), nextNumber: Math.max(1, values.seriesNextNumber), padding: values.seriesPadding, isDefault: true };
      const { series } = await fetchInvoiceSeries({ organizationId: id });
      const current = series.find(item => item.isDefault && !item.archivedAt);

      if (current) {
        await updateInvoiceSeries({ organizationId: id, seriesId: current.id, series: { name: current.name, ...input } });
      } else {
        await createInvoiceSeries({ organizationId: id, series: { name: t('onboarding.series.default-name'), ...input } });
      }
      await queryClient.invalidateQueries({ queryKey: ['invoicing', id] });
    },
    branding: async () => {
      await saveInvoiceBranding({
        organizationId: requireOrganizationId(),
        branding: { accentColor: values.accentColor, paymentDetails: nullable(values.paymentDetails), footerText: nullable(values.footerText) },
      });
    },
    team: async () => {
      const id = requireOrganizationId();
      const invites = values.invites.filter(invite => invite.email.trim());
      const failed: { invite: Invite; message: string }[] = [];

      for (const invite of invites) {
        const [, error] = await safely(inviteOrganizationMember({ organizationId: id, email: invite.email.trim(), role: invite.role }));
        if (error) {
          failed.push({ invite, message: getErrorMessage({ error }) });
        }
      }

      if (failed.length > 0) {
        // Keep only the ones that need fixing.
        setValues({ invites: failed.map(({ invite }) => invite) });
        return failed.map(({ invite, message }) => `${invite.email}: ${message}`).join('\n');
      }
      await queryClient.invalidateQueries({ queryKey: ['organizations', id] });
    },
  };

  async function saveProgress(nextStepId: OnboardingStepId) {
    const id = organizationId();
    await Promise.all([
      props.flow !== 'new-organization' ? updateUserOnboarding({ completed: false, step: nextStepId }) : undefined,
      id && steps.some(item => item.scope === 'organization') ? updateOrganizationOnboarding({ organizationId: id, completed: false, step: nextStepId }) : undefined,
    ]);
  }

  const destination = () => {
    const id = organizationId() ?? joinedOrganizations()[0]?.id;
    return id ? `/organizations/${id}` : '/';
  };

  async function finish() {
    const id = organizationId();
    await Promise.all([
      props.flow !== 'new-organization' ? updateUserOnboarding({ completed: true }) : undefined,
      id && props.flow !== 'invited-user' ? updateOrganizationOnboarding({ organizationId: id, completed: true }) : undefined,
    ]);
    // The onboarding status is refreshed when leaving, so this page keeps showing the done screen.
    await queryClient.invalidateQueries({ queryKey: ['organizations'] });
    setFinished(true);
  }

  function leave() {
    // Lets the onboarding gate through right away; the real status is fetched again behind.
    queryClient.setQueryData<OnboardingStatus>(['onboarding'], status => status && { ...status, flow: null });
    navigate(destination());
    void queryClient.invalidateQueries({ queryKey: ['onboarding'] });
  }

  async function next({ skip = false }: { skip?: boolean } = {}) {
    setError('');
    setIsSaving(true);

    const [message, saveError] = await safely((async () => {
      const result = skip ? undefined : await saveStep[step().id]?.();
      if (result) {
        return result;
      }

      const nextStep = steps[index() + 1];
      if (nextStep) {
        await saveProgress(nextStep.id);
        setIndex(index() + 1);
      } else {
        await finish();
      }
    })());

    setIsSaving(false);

    if (saveError) {
      setError(getErrorMessage({ error: saveError }));
    } else if (message) {
      setError(message);
    }
  }

  function back() {
    setError('');
    setIndex(Math.max(0, index() - 1));
  }

  const respondToInvitation = async ({ invitationId, organization, accept }: { invitationId: string; organization: { id: string; name: string }; accept: boolean }) => {
    setError('');
    const [, respondError] = await safely(accept ? acceptInvitation({ invitationId }) : rejectInvitation({ invitationId }));
    if (respondError) {
      setError(getErrorMessage({ error: respondError }));
      return;
    }
    if (accept) {
      setJoinedOrganizations(current => [...current, organization]);
    }
    await queryClient.invalidateQueries({ queryKey: ['invitations'] });
    await queryClient.invalidateQueries({ queryKey: ['organizations'] });
  };

  const formatRate = (rateBps: number) => `${(rateBps / 100).toLocaleString(getLocale(), { maximumFractionDigits: 2 })} %`;
  const seriesPreview = () => formatSeriesNumber({ prefix: values.seriesPrefix, nextNumber: values.seriesNextNumber, padding: values.seriesPadding });

  return (
    <div class="relative min-h-svh flex items-center justify-center bg-background px-4 py-16">
      <div class="absolute top-4 right-4">
        <UserSettingsDropdown userId={user.id} userName={user.name} userEmail={user.email} />
      </div>

      <div class="w-full max-w-lg">
        <Show
          when={!finished()}
          fallback={(
            <div class="text-center animate-in fade-in slide-in-from-bottom-4">
              <div class="mx-auto size-14 rounded-2xl bg-primary/10 text-primary flex items-center justify-center">
                <div class="i-tabler-confetti size-7" />
              </div>
              <h1 class="mt-6 text-2xl font-semibold tracking-tight">{t('onboarding.done.title')}</h1>
              <p class="mt-2 text-muted-foreground">
                {props.flow === 'invited-user' ? t('onboarding.done.description.invited') : t('onboarding.done.description.company', { company: values.companyName })}
              </p>
              <Show when={props.flow !== 'invited-user'}>
                <ul class="mt-8 grid gap-2 text-left sm:grid-cols-2">
                  <For each={[
                    { icon: 'i-tabler-file-invoice', label: t('onboarding.done.next.invoice') },
                    { icon: 'i-tabler-building-store', label: t('onboarding.done.next.customers') },
                    { icon: 'i-tabler-upload', label: t('onboarding.done.next.documents') },
                    { icon: 'i-tabler-building-bank', label: t('onboarding.done.next.bank') },
                  ]}
                  >
                    {item => (
                      <li class="flex items-center gap-3 rounded-xl border bg-card p-3 text-sm">
                        <div class={cn(item.icon, 'size-4.5 text-primary')} />
                        {item.label}
                      </li>
                    )}
                  </For>
                </ul>
              </Show>
              <Button variant="primary" size="lg" class="mt-8" onClick={leave}>
                {t('onboarding.done.cta')}
                <div class="i-tabler-arrow-right size-4" />
              </Button>
            </div>
          )}
        >
          <form
            class="space-y-8"
            onSubmit={(event) => {
              event.preventDefault();
              void next();
            }}
          >
            <div class="space-y-1.5">
              {/* One segment per step */}
              <div class="mb-6 flex gap-1" role="progressbar" aria-valuemin={1} aria-valuemax={steps.length} aria-valuenow={index() + 1} aria-label={t('onboarding.progress', { current: index() + 1, total: steps.length })}>
                <For each={steps}>
                  {(_, itemIndex) => <div class={cn('h-1 flex-1 rounded-full transition-colors duration-300', itemIndex() <= index() ? 'bg-primary' : 'bg-muted')} />}
                </For>
              </div>
              <h1 class="text-2xl font-semibold tracking-tight">
                {step().id === 'profile' && props.flow === 'invited-user' ? t('onboarding.steps.profile.title-invited') : t(step().titleKey)}
              </h1>
              <p class="text-sm text-muted-foreground">{t(step().descriptionKey)}</p>
            </div>

            <Show when={!isLoadingCompany()} fallback={<div class="i-tabler-loader-2 size-5 animate-spin text-muted-foreground" />}>
              <div class="space-y-5 animate-in fade-in">
                <Switch>
                  <Match when={step().id === 'profile'}>
                    <OnboardingField label={t('onboarding.profile.name.label')}>
                      <TextField value={values.name} onInput={event => setValues({ name: event.currentTarget.value })} placeholder={t('onboarding.profile.name.placeholder')} maxlength={50} autoFocus autocomplete="name" class="h-11 text-base" />
                    </OnboardingField>
                    <p class="text-xs text-muted-foreground">{t('onboarding.profile.email', { email: user.email })}</p>
                  </Match>

                  <Match when={step().id === 'company'}>
                    <OnboardingField label={t('onboarding.company.name.label')} hint={t('onboarding.company.name.hint')}>
                      <TextField value={values.companyName} onInput={event => setValues({ companyName: event.currentTarget.value })} placeholder={t('onboarding.company.name.placeholder')} maxlength={50} autoFocus autocomplete="organization" class="h-11 text-base" />
                    </OnboardingField>
                    <div class="grid gap-2">
                      <span class="text-sm font-medium">{t('onboarding.company.type.label')}</span>
                      <ChoiceCards
                        columns={3}
                        value={values.businessType}
                        onChange={businessType => setValues({ businessType })}
                        options={[
                          { id: 'freelancer', icon: 'i-tabler-user', title: t('onboarding.company.type.freelancer'), description: t('onboarding.company.type.freelancer.description') },
                          { id: 'company', icon: 'i-tabler-building', title: t('onboarding.company.type.company'), description: t('onboarding.company.type.company.description') },
                          { id: 'other', icon: 'i-tabler-users-group', title: t('onboarding.company.type.other'), description: t('onboarding.company.type.other.description') },
                        ]}
                      />
                    </div>
                  </Match>

                  <Match when={step().id === 'fiscal'}>
                    <OnboardingField label={t('onboarding.fiscal.legal-name.label')} hint={values.businessType === 'freelancer' ? t('onboarding.fiscal.legal-name.hint.freelancer') : t('onboarding.fiscal.legal-name.hint.company')}>
                      <TextField value={values.legalName} onInput={event => setValues({ legalName: event.currentTarget.value })} maxlength={200} autoFocus class="h-11 text-base" />
                    </OnboardingField>
                    <div class="grid gap-5 sm:grid-cols-2">
                      <OnboardingField label={values.businessType === 'freelancer' ? t('onboarding.fiscal.tax-id.label.freelancer') : t('onboarding.fiscal.tax-id.label.company')} hint={t('onboarding.fiscal.tax-id.hint')}>
                        <TextField value={values.taxId} onInput={event => setValues({ taxId: event.currentTarget.value.toUpperCase() })} placeholder={values.businessType === 'freelancer' ? '12345678Z' : 'B12345678'} maxlength={30} class="h-11 text-base uppercase" />
                      </OnboardingField>
                      <OnboardingField label={t('onboarding.fiscal.email.label')} hint={t('onboarding.fiscal.email.hint')}>
                        <TextField type="email" value={values.billingEmail} onInput={event => setValues({ billingEmail: event.currentTarget.value })} class="h-11 text-base" />
                      </OnboardingField>
                    </div>
                  </Match>

                  <Match when={step().id === 'address'}>
                    <OnboardingField label={t('onboarding.address.line1.label')}>
                      <TextField value={values.addressLine1} onInput={event => setValues({ addressLine1: event.currentTarget.value })} placeholder={t('onboarding.address.line1.placeholder')} autoFocus autocomplete="address-line1" class="h-11 text-base" />
                    </OnboardingField>
                    <OnboardingField label={t('onboarding.address.line2.label')}>
                      <TextField value={values.addressLine2} onInput={event => setValues({ addressLine2: event.currentTarget.value })} placeholder={t('onboarding.address.line2.placeholder')} autocomplete="address-line2" class="h-11 text-base" />
                    </OnboardingField>
                    <div class="grid gap-5 sm:grid-cols-[1fr_2fr]">
                      <OnboardingField label={t('onboarding.address.postal-code.label')}>
                        <TextField value={values.postalCode} onInput={event => setValues({ postalCode: event.currentTarget.value })} autocomplete="postal-code" inputmode="numeric" class="h-11 text-base" />
                      </OnboardingField>
                      <OnboardingField label={t('onboarding.address.city.label')}>
                        <TextField value={values.city} onInput={event => setValues({ city: event.currentTarget.value })} autocomplete="address-level2" class="h-11 text-base" />
                      </OnboardingField>
                    </div>
                    <div class="grid gap-5 sm:grid-cols-2">
                      <OnboardingField label={t('onboarding.address.region.label')}>
                        <TextField value={values.region} onInput={event => setValues({ region: event.currentTarget.value })} autocomplete="address-level1" class="h-11 text-base" />
                      </OnboardingField>
                      <OnboardingField label={t('onboarding.address.country.label')}>
                        <TextField value={values.country} onInput={event => setValues({ country: event.currentTarget.value })} autocomplete="country-name" class="h-11 text-base" />
                      </OnboardingField>
                    </div>
                  </Match>

                  <Match when={step().id === 'invoicing'}>
                    <div class="grid gap-2">
                      <span class="text-sm font-medium">{t('onboarding.invoicing.currency.label')}</span>
                      <ChoiceChips options={CURRENCIES.map(currency => ({ id: currency, label: currency }))} value={values.currency} onChange={currency => setValues({ currency })} />
                    </div>
                    <div class="grid gap-2">
                      <span class="text-sm font-medium">{t('onboarding.invoicing.payment-terms.label')}</span>
                      <ChoiceChips
                        options={PAYMENT_TERMS.map(days => ({ id: days, label: days === 0 ? t('onboarding.invoicing.payment-terms.immediate') : t('onboarding.invoicing.payment-terms.days', { days }) }))}
                        value={values.paymentTermsDays}
                        onChange={paymentTermsDays => setValues({ paymentTermsDays })}
                      />
                      <span class="text-xs text-muted-foreground">{t('onboarding.invoicing.payment-terms.hint')}</span>
                    </div>
                    <div class="grid gap-2">
                      <span class="text-sm font-medium">{t('onboarding.invoicing.template.label')}</span>
                      <ChoiceCards
                        value={values.templateId}
                        onChange={templateId => setValues({ templateId })}
                        options={[
                          { id: 'minimal', title: t('onboarding.invoicing.template.minimal'), description: t('onboarding.invoicing.template.minimal.description'), preview: <InvoiceThumbnail variant="minimal" accentColor={values.accentColor} /> },
                          { id: 'classic', title: t('onboarding.invoicing.template.classic'), description: t('onboarding.invoicing.template.classic.description'), preview: <InvoiceThumbnail variant="classic" accentColor={values.accentColor} /> },
                        ]}
                      />
                    </div>
                  </Match>

                  <Match when={step().id === 'taxes'}>
                    <div class="grid gap-2">
                      <Index each={values.taxRates}>
                        {(rate, rateIndex) => (
                          <div class={cn('flex items-center gap-3 rounded-xl border bg-card px-4 py-3 transition-colors', rate().selected && 'border-primary/50 bg-primary/3')}>
                            <SimpleCheckbox
                              checked={rate().selected}
                              aria-label={rate().name}
                              onChange={checked => setValues('taxRates', rateIndex, 'selected', checked)}
                            />
                            <div class="min-w-0 flex-1">
                              <span class="block text-sm font-medium">{rate().name}</span>
                            </div>
                            <span class="text-sm tabular-nums text-muted-foreground">{formatRate(rate().rateBps)}</span>
                            <button
                              type="button"
                              disabled={!rate().selected}
                              onClick={() => setValues({ defaultRateBps: rate().rateBps })}
                              class={cn(
                                'rounded-full border px-2.5 py-0.5 text-xs transition-colors disabled:opacity-0',
                                values.defaultRateBps === rate().rateBps ? 'border-primary bg-primary text-primary-foreground' : 'text-muted-foreground hover:text-foreground',
                              )}
                            >
                              {values.defaultRateBps === rate().rateBps ? t('onboarding.taxes.default') : t('onboarding.taxes.make-default')}
                            </button>
                          </div>
                        )}
                      </Index>
                    </div>
                    <div class="grid gap-2 sm:grid-cols-[2fr_1fr_auto] items-end">
                      <OnboardingField label={t('onboarding.taxes.custom.name')}>
                        <TextField value={values.customTaxName} onInput={event => setValues({ customTaxName: event.currentTarget.value })} placeholder={t('onboarding.taxes.custom.name.placeholder')} maxlength={100} />
                      </OnboardingField>
                      <OnboardingField label={t('onboarding.taxes.custom.rate')}>
                        <TextField type="number" min="0" max="100" step="0.01" value={values.customTaxRate} onInput={event => setValues({ customTaxRate: event.currentTarget.value })} placeholder="7" />
                      </OnboardingField>
                      <Button
                        type="button"
                        variant="outline"
                        disabled={!values.customTaxName.trim() || values.customTaxRate === '' || Number(values.customTaxRate) < 0 || Number(values.customTaxRate) > 100}
                        onClick={() => {
                          const rateBps = Math.round(Number(values.customTaxRate) * 100);
                          setValues({
                            taxRates: [...values.taxRates.filter(rate => rate.rateBps !== rateBps), { name: values.customTaxName.trim(), rateBps, selected: true }],
                            customTaxName: '',
                            customTaxRate: '',
                          });
                        }}
                      >
                        <div class="i-tabler-plus size-4" />
                        {t('onboarding.taxes.custom.add')}
                      </Button>
                    </div>
                  </Match>

                  <Match when={step().id === 'series'}>
                    <div class="grid gap-5 sm:grid-cols-3">
                      <OnboardingField label={t('onboarding.series.prefix.label')} class="sm:col-span-1">
                        <TextField value={values.seriesPrefix} onInput={event => setValues({ seriesPrefix: event.currentTarget.value })} maxlength={30} autoFocus class="h-11 text-base" />
                      </OnboardingField>
                      <OnboardingField label={t('onboarding.series.next-number.label')}>
                        <TextField type="number" min="1" value={values.seriesNextNumber} onInput={event => setValues({ seriesNextNumber: Number(event.currentTarget.value) || 1 })} class="h-11 text-base" />
                      </OnboardingField>
                      <OnboardingField label={t('onboarding.series.padding.label')}>
                        <TextField type="number" min="1" max="12" value={values.seriesPadding} onInput={event => setValues({ seriesPadding: Math.min(12, Math.max(1, Number(event.currentTarget.value) || 1)) })} class="h-11 text-base" />
                      </OnboardingField>
                    </div>
                    <p class="text-xs text-muted-foreground">{t('onboarding.series.next-number.hint')}</p>
                    <div class="rounded-xl border bg-card p-5">
                      <span class="text-xs text-muted-foreground">{t('onboarding.series.preview')}</span>
                      <p class="mt-1 font-mono text-xl font-semibold tracking-tight">{seriesPreview()}</p>
                    </div>
                    <ChoiceChips
                      options={[`F${new Date().getFullYear()}-`, 'FAC-', 'INV-', `${new Date().getFullYear()}/`].map(prefix => ({ id: prefix, label: prefix }))}
                      value={values.seriesPrefix}
                      onChange={seriesPrefix => setValues({ seriesPrefix })}
                    />
                  </Match>

                  <Match when={step().id === 'branding'}>
                    <div class="grid gap-2">
                      <span class="text-sm font-medium">{t('onboarding.branding.accent-color.label')}</span>
                      <div class="flex flex-wrap items-center gap-2">
                        <For each={ACCENT_COLORS}>
                          {color => (
                            <button
                              type="button"
                              aria-label={color}
                              aria-pressed={values.accentColor.toLowerCase() === color.toLowerCase()}
                              onClick={() => setValues({ accentColor: color })}
                              class={cn('size-8 rounded-full border-2 border-background transition-transform hover:scale-110', values.accentColor.toLowerCase() === color.toLowerCase() && 'ring-2 ring-primary ring-offset-2 ring-offset-background')}
                              style={{ background: color }}
                            />
                          )}
                        </For>
                        <label class="relative size-8 rounded-full border border-dashed flex items-center justify-center cursor-pointer text-muted-foreground hover:text-foreground" title={t('onboarding.branding.accent-color.custom')}>
                          <div class="i-tabler-color-picker size-4" />
                          <input type="color" class="absolute inset-0 opacity-0 cursor-pointer" value={values.accentColor} onInput={event => setValues({ accentColor: event.currentTarget.value })} />
                        </label>
                      </div>
                    </div>
                    <OnboardingField label={t('onboarding.branding.payment-details.label')} hint={t('onboarding.branding.payment-details.hint')}>
                      <TextArea value={values.paymentDetails} onInput={event => setValues({ paymentDetails: event.currentTarget.value })} placeholder={t('onboarding.branding.payment-details.placeholder')} maxlength={2000} rows={3} />
                    </OnboardingField>
                    <OnboardingField label={t('onboarding.branding.footer.label')}>
                      <TextField value={values.footerText} onInput={event => setValues({ footerText: event.currentTarget.value })} placeholder={t('onboarding.branding.footer.placeholder')} maxlength={500} />
                    </OnboardingField>
                    <InvoicePreview
                      accentColor={values.accentColor}
                      companyName={values.legalName || values.companyName}
                      taxId={values.taxId}
                      number={seriesPreview()}
                      paymentDetails={values.paymentDetails}
                      footerText={values.footerText}
                    />
                  </Match>

                  <Match when={step().id === 'team'}>
                    <div class="grid gap-2">
                      <Index each={values.invites}>
                        {(invite, inviteIndex) => (
                          <div class="flex gap-2">
                            <TextField
                              type="email"
                              aria-label={t('onboarding.team.email.label')}
                              value={invite().email}
                              onInput={event => setValues('invites', inviteIndex, 'email', event.currentTarget.value)}
                              placeholder={t('onboarding.team.email.placeholder')}
                              autoFocus={inviteIndex === values.invites.length - 1}
                              class="h-11 text-base"
                            />
                            <SimpleSelect
                              aria-label={t('onboarding.team.role.label')}
                              triggerClass="h-11 w-32"
                              value={invite().role}
                              onChange={role => setValues('invites', inviteIndex, 'role', role as Invite['role'])}
                              options={[
                                { value: 'member', label: t('organizations.members.roles.member') },
                                { value: 'admin', label: t('organizations.members.roles.admin') },
                              ]}
                            />
                            <Show when={values.invites.length > 1}>
                              <Button type="button" variant="ghost" size="icon" class="size-11" aria-label={t('onboarding.team.remove')} onClick={() => setValues({ invites: values.invites.filter((_, i) => i !== inviteIndex) })}>
                                <div class="i-tabler-x size-4" />
                              </Button>
                            </Show>
                          </div>
                        )}
                      </Index>
                      <Button type="button" variant="ghost" size="sm" class="justify-self-start text-muted-foreground" onClick={() => setValues({ invites: [...values.invites, { email: '', role: 'member' }] })}>
                        <div class="i-tabler-plus size-4" />
                        {t('onboarding.team.add')}
                      </Button>
                    </div>
                    <div class="rounded-xl border bg-card p-4 text-xs leading-relaxed text-muted-foreground">
                      <p>
                        <span class="font-medium text-foreground">{t('organizations.members.roles.admin')}</span>
                        {` — ${t('onboarding.team.role.admin.description')}`}
                      </p>
                      <p class="mt-1">
                        <span class="font-medium text-foreground">{t('organizations.members.roles.member')}</span>
                        {` — ${t('onboarding.team.role.member.description')}`}
                      </p>
                    </div>
                  </Match>

                  <Match when={step().id === 'invitations'}>
                    <Show when={!invitationsQuery.isLoading} fallback={<div class="i-tabler-loader-2 size-5 animate-spin text-muted-foreground" />}>
                      <div class="grid gap-2">
                        <For each={joinedOrganizations()}>
                          {organization => (
                            <div class="flex items-center gap-3 rounded-xl border border-primary/40 bg-primary/5 px-4 py-3">
                              <div class="i-tabler-circle-check size-5 text-primary" />
                              <span class="text-sm">{t('onboarding.invitations.joined', { organization: organization.name })}</span>
                            </div>
                          )}
                        </For>
                        <For
                          each={invitationsQuery.data?.invitations ?? []}
                          fallback={(
                            <Show when={joinedOrganizations().length === 0}>
                              <p class="rounded-xl border bg-card px-4 py-6 text-center text-sm text-muted-foreground">{t('onboarding.invitations.empty')}</p>
                            </Show>
                          )}
                        >
                          {invitation => (
                            <div class="flex items-center gap-3 rounded-xl border bg-card px-4 py-3">
                              <div class="size-9 shrink-0 rounded-lg border bg-background flex items-center justify-center">
                                <div class="i-tabler-building size-4.5" />
                              </div>
                              <span class="min-w-0 flex-1 truncate text-sm font-medium">{invitation.organization.name}</span>
                              <Button type="button" variant="ghost" size="sm" onClick={() => respondToInvitation({ invitationId: invitation.id, organization: invitation.organization, accept: false })}>
                                {t('onboarding.invitations.decline')}
                              </Button>
                              <Button type="button" variant="primary" size="sm" onClick={() => respondToInvitation({ invitationId: invitation.id, organization: invitation.organization, accept: true })}>
                                {t('onboarding.invitations.accept')}
                              </Button>
                            </div>
                          )}
                        </For>
                      </div>
                    </Show>
                  </Match>
                </Switch>

                <Show when={error()}>
                  <p role="alert" class="whitespace-pre-line text-sm text-destructive">{error()}</p>
                </Show>
              </div>
            </Show>

            <div class="flex items-center justify-between gap-3">
              <Show
                when={index() > 0}
                fallback={(
                  <Show when={props.flow === 'new-organization'} fallback={<span />}>
                    <Button type="button" variant="ghost" disabled={isSaving()} onClick={() => (window.history.length > 1 ? window.history.back() : navigate('/'))}>
                      <div class="i-tabler-arrow-left size-4" />
                      {t('onboarding.actions.cancel')}
                    </Button>
                  </Show>
                )}
              >
                <Button type="button" variant="ghost" disabled={isSaving()} onClick={back}>
                  <div class="i-tabler-arrow-left size-4" />
                  {t('onboarding.actions.back')}
                </Button>
              </Show>
              <div class="flex items-center gap-2">
                <Show when={step().optional}>
                  <Button type="button" variant="ghost" class="text-muted-foreground" disabled={isSaving()} onClick={() => next({ skip: true })}>
                    {t('onboarding.actions.skip')}
                  </Button>
                </Show>
                <Button type="submit" variant="primary" class="min-w-28" isLoading={isSaving()} disabled={isLoadingCompany()}>
                  {isSaving() ? t('onboarding.actions.saving') : index() === steps.length - 1 ? t('onboarding.actions.finish') : t('onboarding.actions.continue')}
                </Button>
              </div>
            </div>
          </form>
        </Show>
      </div>
    </div>
  );
};
