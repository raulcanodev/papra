import type { Component } from 'solid-js';
import type { Organization } from '../organizations.types';
import { safely } from '@corentinth/chisels';
import { useNavigate, useParams } from '@solidjs/router';
import { useQuery } from '@tanstack/solid-query';
import { createSignal, Match, Show, Suspense, Switch } from 'solid-js';
import * as v from 'valibot';
import { isDemoMode } from '@/modules/config/config';
import { useConfig } from '@/modules/config/config.provider';
import { useI18n } from '@/modules/i18n/i18n.provider';
import { useConfirmModal } from '@/modules/shared/confirm';
import { createForm } from '@/modules/shared/form/form';
import { useI18nApiErrors } from '@/modules/shared/http/composables/i18n-api-errors';
import { fetchOrganizationSubscription, getCustomerPortalUrl } from '@/modules/subscriptions/subscriptions.services';
import { Button } from '@/modules/ui/components/button';
import { SettingsSection, SettingsSections } from '@/modules/ui/components/settings-section';
import { createToast } from '@/modules/ui/components/sonner';
import { TextField, TextFieldLabel, TextFieldRoot } from '@/modules/ui/components/textfield';
import { useCurrentUserRole, useDeleteOrganization, useUpdateOrganization } from '../organizations.composables';
import { organizationNameSchema } from '../organizations.schemas';
import { fetchOrganization } from '../organizations.services';

const DeleteOrganizationSection: Component<{ organization: Organization }> = (props) => {
  const { deleteOrganization } = useDeleteOrganization();
  const { confirm } = useConfirmModal();
  const { t } = useI18n();
  const { getErrorMessage } = useI18nApiErrors();
  const navigate = useNavigate();
  const { config } = useConfig();

  const { getIsOwner, query } = useCurrentUserRole({ organizationId: props.organization.id });

  // Fetch subscription to check if organization has an active subscription
  const subscriptionQuery = useQuery(() => ({
    queryKey: ['organizations', props.organization.id, 'subscription'],
    queryFn: () => fetchOrganizationSubscription({ organizationId: props.organization.id }),
    enabled: config.isSubscriptionsEnabled,
  }));

  // Check if subscription blocks deletion (active and not scheduled to cancel)
  const getHasBlockingSubscription = () => {
    if (!config.isSubscriptionsEnabled) {
      return false;
    }

    const subscription = subscriptionQuery.data?.subscription;
    if (!subscription) {
      return false;
    }

    // Allow deletion if subscription is canceled or scheduled to cancel
    if (subscription.status === 'canceled' || subscription.cancelAtPeriodEnd) {
      return false;
    }

    // Block deletion for all other active subscription statuses
    return true;
  };

  const handleDelete = async () => {
    const confirmed = await confirm({
      title: t('organization.settings.delete.confirm.title'),
      message: t('organization.settings.delete.confirm.message', { days: 30 }),
      confirmButton: {
        text: t('organization.settings.delete.confirm.confirm-button'),
        variant: 'destructive',
      },
      cancelButton: {
        text: t('organization.settings.delete.confirm.cancel-button'),
      },
      shouldType: props.organization.name,
    });

    if (!confirmed) {
      return;
    }

    const [, error] = await safely(deleteOrganization({ organizationId: props.organization.id }));

    if (error) {
      createToast({ type: 'error', message: getErrorMessage({ error }) });
      return;
    }

    createToast({ type: 'success', message: t('organization.settings.delete.success') });
    navigate('/organizations');
  };

  return (
    <SettingsSection title={t('organization.settings.delete.title')} description={t('organization.settings.delete.description')} variant="destructive">
      <div class="flex flex-col items-start gap-3 sm:flex-row sm:items-center">
        <Button class="flex-shrink-0" onClick={handleDelete} variant="destructive" disabled={!getIsOwner() || getHasBlockingSubscription()}>
          {t('organization.settings.delete.confirm.confirm-button')}
        </Button>

        <Switch>
          <Match when={query.isSuccess && !getIsOwner()}>
            <span class="text-xs text-muted-foreground">
              {t('organization.settings.delete.only-owner')}
            </span>
          </Match>

          <Match when={getHasBlockingSubscription()}>
            <span class="text-xs text-muted-foreground">
              {t('organization.settings.delete.has-active-subscription')}
            </span>
          </Match>
        </Switch>
      </div>
    </SettingsSection>
  );
};

export const SubscriptionSection: Component<{ organization: Organization }> = (props) => {
  const { config } = useConfig();

  if (!config.isSubscriptionsEnabled) {
    return null;
  }

  const [getIsLoading, setIsLoading] = createSignal(false);
  const { t } = useI18n();

  const goToCustomerPortal = async () => {
    setIsLoading(true);

    const [result, error] = await safely(getCustomerPortalUrl({ organizationId: props.organization.id }));

    if (error) {
      createToast({ type: 'error', message: t('organization.settings.subscription.error') });
      setIsLoading(false);

      return;
    }

    window.open(result.customerPortalUrl, '_blank');

    setTimeout(() => {
      setIsLoading(false);
    }, 1000);
  };

  return (
    <SettingsSection title={t('organization.settings.subscription.title')} description={t('organization.settings.subscription.description')}>
      <div>
        <Button onClick={goToCustomerPortal} isLoading={getIsLoading()} disabled={isDemoMode}>
          {t('organization.settings.subscription.manage')}
        </Button>
      </div>
    </SettingsSection>
  );
};

const UpdateOrganizationNameSection: Component<{ organization: Organization }> = (props) => {
  const { updateOrganization } = useUpdateOrganization();
  const { t } = useI18n();

  const { form, Form, Field } = createForm({
    schema: v.object({
      organizationName: organizationNameSchema,
    }),
    initialValues: {
      organizationName: props.organization.name,
    },
    onSubmit: async ({ organizationName }) => {
      await updateOrganization({
        organizationId: props.organization.id,
        organizationName: organizationName.trim(),
      });

      createToast({ type: 'success', message: t('organization.settings.name.updated') });
    },
  });

  return (
    <SettingsSection title={t('organization.settings.name.title')}>
      <Form>
        <Field name="organizationName">
          {(field, inputProps) => (
            <TextFieldRoot class="flex flex-col gap-1">
              <TextFieldLabel for="organizationName" class="sr-only">
                {t('organization.settings.name.title')}
              </TextFieldLabel>
              <div class="flex gap-2 flex-col sm:flex-row">
                <TextField type="text" id="organizationName" placeholder={t('organization.settings.name.placeholder')} {...inputProps} autoFocus value={field.value} aria-invalid={Boolean(field.error)} />

                <Button type="submit" isLoading={form.submitting} class="flex-shrink-0" disabled={field.value?.trim() === props.organization.name}>
                  {t('organization.settings.name.update')}
                </Button>
              </div>
              {field.error && <div class="text-red-500 text-sm">{field.error}</div>}
            </TextFieldRoot>
          )}
        </Field>

        <div class="text-red-500 text-sm">{form.response.message}</div>
      </Form>
    </SettingsSection>
  );
};

export const OrganizationsSettingsPage: Component = () => {
  const params = useParams();
  const { t } = useI18n();

  const query = useQuery(() => ({
    queryKey: ['organizations', params.organizationId],
    queryFn: () => fetchOrganization({ organizationId: params.organizationId }),
  }));

  return (
    <div class="page-narrow">
      <Suspense>
        <Show when={query.data?.organization}>
          { getOrganization => (
            <>
              <div class="page-header">
                <div>
                  <h1 class="page-title">{t('organization.settings.page.title')}</h1>
                  <p class="page-description">{t('organization.settings.page.description')}</p>
                </div>
              </div>

              <SettingsSections>
                <UpdateOrganizationNameSection organization={getOrganization()} />
                <SubscriptionSection organization={getOrganization()} />
                <DeleteOrganizationSection organization={getOrganization()} />
              </SettingsSections>
            </>
          )}
        </Show>
      </Suspense>
    </div>
  );
};
