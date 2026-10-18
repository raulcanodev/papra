import type { Component } from 'solid-js';
import type { SsoProviderConfig } from '@/modules/auth/auth.types';
import { useSearchParams } from '@solidjs/router';
import { useMutation, useQuery } from '@tanstack/solid-query';
import { createSignal, For, onMount, Show } from 'solid-js';
import * as v from 'valibot';
import { getEnabledSsoProviderConfigs } from '@/modules/auth/auth.models';
import { changePassword, linkProvider, listAccounts, unlinkAccount } from '@/modules/auth/auth.services';
import { PasswordField } from '@/modules/auth/components/password-field.component';
import { useConfig } from '@/modules/config/config.provider';
import { useI18n } from '@/modules/i18n/i18n.provider';
import { createForm } from '@/modules/shared/form/form';
import { cn } from '@/modules/shared/style/cn';
import { Badge } from '@/modules/ui/components/badge';
import { Button } from '@/modules/ui/components/button';
import { Checkbox, CheckboxControl, CheckboxLabel } from '@/modules/ui/components/checkbox';
import { SettingsSection } from '@/modules/ui/components/settings-section';
import { createToast } from '@/modules/ui/components/sonner';
import { TextFieldLabel, TextFieldRoot } from '@/modules/ui/components/textfield';
import { setPassword } from '../users.services';

const CREDENTIAL_PROVIDER_ID = 'credential';

export function useUserAccounts() {
  const query = useQuery(() => ({
    queryKey: ['users', 'me', 'accounts'],
    queryFn: async () => {
      const { data, error } = await listAccounts();

      if (error) {
        throw error;
      }

      return { accounts: data ?? [] };
    },
  }));

  const getAccounts = () => query.data?.accounts ?? [];

  return {
    query,
    getAccounts,
    getHasPassword: () => getAccounts().some(({ providerId }) => providerId === CREDENTIAL_PROVIDER_ID),
  };
}

const PasswordFieldRow: Component<{ name: string; label: string; error?: string; inputProps: object; value?: string; autocomplete: string }> = (props) => {
  const { t } = useI18n();

  return (
    <TextFieldRoot class="flex flex-col gap-1">
      <TextFieldLabel for={props.name}>{props.label}</TextFieldLabel>
      <PasswordField
        id={props.name}
        autocomplete={props.autocomplete}
        {...props.inputProps}
        value={props.value ?? ''}
        aria-invalid={Boolean(props.error)}
        showPasswordLabel={t('auth.password.show')}
        hidePasswordLabel={t('auth.password.hide')}
      />
      {props.error && <div class="text-red-500 text-sm">{props.error}</div>}
    </TextFieldRoot>
  );
};

function useNewPasswordSchema() {
  const { t } = useI18n();

  return v.pipe(
    v.string(),
    v.nonEmpty(t('user.settings.password.new-password.required')),
    v.minLength(8, t('user.settings.password.new-password.min-length', { minLength: 8 })),
    v.maxLength(128, t('user.settings.password.new-password.max-length', { maxLength: 128 })),
  );
}

const ChangePasswordForm: Component = () => {
  const { t } = useI18n();
  const [getRevokeOtherSessions, setRevokeOtherSessions] = createSignal(true);
  const newPasswordSchema = useNewPasswordSchema();

  const { form, Form, Field, createFormError } = createForm({
    schema: v.object({
      currentPassword: v.pipe(v.string(), v.nonEmpty(t('user.settings.password.current-password.required'))),
      newPassword: newPasswordSchema,
      confirmPassword: v.string(),
    }),
    initialValues: { currentPassword: '', newPassword: '', confirmPassword: '' },
    onSubmit: async ({ currentPassword, newPassword, confirmPassword }) => {
      if (newPassword !== confirmPassword) {
        throw createFormError({ message: '', fields: { confirmPassword: t('user.settings.password.confirm-password.mismatch') } });
      }

      const { error } = await changePassword({ currentPassword, newPassword, revokeOtherSessions: getRevokeOtherSessions() });

      if (error) {
        throw createFormError({
          message: error.code === 'INVALID_PASSWORD'
            ? t('user.settings.password.change.invalid-current-password')
            : t('user.settings.password.change.error'),
        });
      }

      createToast({ type: 'success', message: t('user.settings.password.change.success') });
    },
  });

  return (
    <Form class="flex flex-col gap-4 max-w-md">
      <Field name="currentPassword">
        {(field, inputProps) => (
          <PasswordFieldRow name="current-password" autocomplete="current-password" label={t('user.settings.password.current-password.label')} error={field.error} inputProps={inputProps} value={field.value} />
        )}
      </Field>
      <Field name="newPassword">
        {(field, inputProps) => (
          <PasswordFieldRow name="new-password" autocomplete="new-password" label={t('user.settings.password.new-password.label')} error={field.error} inputProps={inputProps} value={field.value} />
        )}
      </Field>
      <Field name="confirmPassword">
        {(field, inputProps) => (
          <PasswordFieldRow name="confirm-password" autocomplete="new-password" label={t('user.settings.password.confirm-password.label')} error={field.error} inputProps={inputProps} value={field.value} />
        )}
      </Field>

      <Checkbox class="flex items-center gap-2" checked={getRevokeOtherSessions()} onChange={setRevokeOtherSessions}>
        <CheckboxControl />
        <CheckboxLabel class="text-sm font-medium leading-none">
          {t('user.settings.password.revoke-other-sessions')}
        </CheckboxLabel>
      </Checkbox>

      <Show when={form.response.message}>
        <div class="text-red-500 text-sm">{form.response.message}</div>
      </Show>

      <div>
        <Button type="submit" isLoading={form.submitting}>{t('user.settings.password.change.submit')}</Button>
      </div>
    </Form>
  );
};

const SetPasswordForm: Component<{ onSuccess: () => void }> = (props) => {
  const { t } = useI18n();
  const newPasswordSchema = useNewPasswordSchema();

  const { form, Form, Field, createFormError } = createForm({
    schema: v.object({
      newPassword: newPasswordSchema,
      confirmPassword: v.string(),
    }),
    initialValues: { newPassword: '', confirmPassword: '' },
    onSubmit: async ({ newPassword, confirmPassword }) => {
      if (newPassword !== confirmPassword) {
        throw createFormError({ message: '', fields: { confirmPassword: t('user.settings.password.confirm-password.mismatch') } });
      }

      try {
        await setPassword({ newPassword });
      } catch {
        throw createFormError({ message: t('user.settings.password.set.error') });
      }

      createToast({ type: 'success', message: t('user.settings.password.set.success') });
      props.onSuccess();
    },
  });

  return (
    <Form class="flex flex-col gap-4 max-w-md">
      <Field name="newPassword">
        {(field, inputProps) => (
          <PasswordFieldRow name="new-password" autocomplete="new-password" label={t('user.settings.password.new-password.label')} error={field.error} inputProps={inputProps} value={field.value} />
        )}
      </Field>
      <Field name="confirmPassword">
        {(field, inputProps) => (
          <PasswordFieldRow name="confirm-password" autocomplete="new-password" label={t('user.settings.password.confirm-password.label')} error={field.error} inputProps={inputProps} value={field.value} />
        )}
      </Field>

      <Show when={form.response.message}>
        <div class="text-red-500 text-sm">{form.response.message}</div>
      </Show>

      <div>
        <Button type="submit" isLoading={form.submitting}>{t('user.settings.password.set.submit')}</Button>
      </div>
    </Form>
  );
};

export const PasswordSection: Component<{ hasPassword: boolean; onUpdate: () => void }> = (props) => {
  const { t } = useI18n();

  return (
    <SettingsSection
      title={t('user.settings.password.title')}
      description={props.hasPassword ? t('user.settings.password.description.change') : t('user.settings.password.description.set')}
    >
      <Show when={props.hasPassword} fallback={<SetPasswordForm onSuccess={props.onUpdate} />}>
        <ChangePasswordForm />
      </Show>
    </SettingsSection>
  );
};

const ProviderIcon: Component<{ provider: SsoProviderConfig }> = props => (
  <Show
    when={props.provider.icon.startsWith('i-')}
    fallback={<img src={props.provider.icon} alt="" class="size-5" />}
  >
    <span class={cn('size-5', props.provider.icon)} />
  </Show>
);

export const LinkedAccountsSection: Component<{ accounts: { providerId: string }[]; hasPassword: boolean; onUpdate: () => void }> = (props) => {
  const { t } = useI18n();
  const { config } = useConfig();
  const [searchParams, setSearchParams] = useSearchParams();

  const getProviders = () => getEnabledSsoProviderConfigs({ config });
  const isLinked = (provider: SsoProviderConfig) => props.accounts.some(({ providerId }) => providerId === provider.key);
  // Unlinking the only way in would lock the account out, the server refuses it too
  const getCanUnlink = () => props.accounts.length > 1;

  onMount(() => {
    // a failed link comes back from the provider with an error in the url
    const error = searchParams.error;

    if (error) {
      createToast({
        type: 'error',
        message: error === 'email_doesn\'t_match'
          ? t('user.settings.linked-accounts.link.error.email-mismatch')
          : error === 'account_already_linked_to_different_user'
            ? t('user.settings.linked-accounts.link.error.already-linked')
            : t('user.settings.linked-accounts.link.error'),
      });
      setSearchParams({ error: undefined }, { replace: true });
    }
  });

  const linkMutation = useMutation(() => ({
    mutationFn: async ({ provider }: { provider: SsoProviderConfig }) => linkProvider({ provider, config }),
    onError: () => createToast({ type: 'error', message: t('user.settings.linked-accounts.link.error') }),
  }));

  const unlinkMutation = useMutation(() => ({
    mutationFn: async ({ provider }: { provider: SsoProviderConfig }) => {
      const { error } = await unlinkAccount({ providerId: provider.key });

      if (error) {
        throw error;
      }
    },
    onSuccess: () => {
      createToast({ type: 'success', message: t('user.settings.linked-accounts.unlink.success') });
      props.onUpdate();
    },
    onError: () => createToast({ type: 'error', message: t('user.settings.linked-accounts.unlink.error') }),
  }));

  return (
    <Show when={getProviders().length > 0}>
      <SettingsSection title={t('user.settings.linked-accounts.title')} description={t('user.settings.linked-accounts.description')}>
        <div class="flex flex-col divide-y border rounded-md">
          <For each={getProviders()}>
            {provider => (
              <div class="flex items-center gap-3 p-3">
                <ProviderIcon provider={provider} />
                <span class="font-medium flex-1">{provider.name}</span>

                <Show
                  when={isLinked(provider)}
                  fallback={(
                    <Button
                      variant="outline"
                      size="sm"
                      isLoading={linkMutation.isPending && linkMutation.variables?.provider.key === provider.key}
                      onClick={() => linkMutation.mutate({ provider })}
                    >
                      {t('user.settings.linked-accounts.link')}
                    </Button>
                  )}
                >
                  <Badge variant="secondary">{t('user.settings.linked-accounts.linked')}</Badge>
                  <Button
                    variant="ghost"
                    size="sm"
                    disabled={!getCanUnlink()}
                    title={getCanUnlink() ? undefined : t('user.settings.linked-accounts.unlink.only-method')}
                    isLoading={unlinkMutation.isPending && unlinkMutation.variables?.provider.key === provider.key}
                    onClick={() => unlinkMutation.mutate({ provider })}
                  >
                    {t('user.settings.linked-accounts.unlink')}
                  </Button>
                </Show>
              </div>
            )}
          </For>
        </div>

        <Show when={!props.hasPassword}>
          <p class="text-sm text-muted-foreground mt-3">{t('user.settings.linked-accounts.no-password-hint')}</p>
        </Show>
      </SettingsSection>
    </Show>
  );
};
