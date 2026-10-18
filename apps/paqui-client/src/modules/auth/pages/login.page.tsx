import type { Component } from 'solid-js';
import type { SsoProviderConfig } from '../auth.types';
import { buildUrl } from '@corentinth/chisels';
import { A, useNavigate, useSearchParams } from '@solidjs/router';
import { useMutation } from '@tanstack/solid-query';
import { createSignal, For, Show } from 'solid-js';
import * as v from 'valibot';
import { useConfig } from '@/modules/config/config.provider';
import { useI18n } from '@/modules/i18n/i18n.provider';
import { createForm } from '@/modules/shared/form/form';
import { useI18nApiErrors } from '@/modules/shared/http/composables/i18n-api-errors';
import { Button } from '@/modules/ui/components/button';
import { Checkbox, CheckboxControl, CheckboxLabel } from '@/modules/ui/components/checkbox';
import { Separator } from '@/modules/ui/components/separator';
import { createToast } from '@/modules/ui/components/sonner';
import { TextField, TextFieldLabel, TextFieldRoot } from '@/modules/ui/components/textfield';
import { authPagesPaths } from '../auth.constants';
import { getEnabledSsoProviderConfigs, isEmailVerificationRequiredError } from '../auth.models';
import { authWithProvider, signIn, twoFactor } from '../auth.services';
import { readRememberedLogin, writeRememberedLogin } from '../auth.storage';
import { AuthBackgroundLayout, AuthCard } from '../components/auth-card-layout.component';
import { AuthLegalLinks } from '../components/legal-links.component';
import { NoAuthProviderWarning } from '../components/no-auth-provider';
import { PasswordField } from '../components/password-field.component';
import { SsoProviderButton } from '../components/sso-provider-button.component';
import { TotpField } from '../components/verify-otp.component';

const TotpVerificationForm: Component = () => {
  const navigate = useNavigate();
  const { t } = useI18n();
  const [trustDevice, setTrustDevice] = createSignal(false);
  const [totpCode, setTotpCode] = createSignal('');

  const verifyMutation = useMutation(() => ({
    mutationFn: async ({ code, trust }: { code: string; trust: boolean }) => {
      const { error } = await twoFactor.verifyTotp({ code, trustDevice: trust });

      if (error) {
        createToast({ type: 'error', message: t('auth.login.two-factor.verification-failed') });
        throw new Error(error.message);
      }
    },
    onSuccess: () => {
      navigate('/');
    },
  }));

  const handleTotpComplete = (code: string) => {
    setTotpCode(code);
    if (code.length === 6) {
      verifyMutation.mutate({ code, trust: trustDevice() });
    }
  };

  return (
    <div>
      <p class="text-muted-foreground mt-1 mb-4">
        {t('auth.login.two-factor.description.totp')}
      </p>

      <div class="flex flex-col gap-1 mb-4 items-center">
        <label class="sr-only">{t('auth.login.two-factor.code.label.totp')}</label>
        <TotpField value={totpCode()} onValueChange={handleTotpComplete} />
        <Show when={verifyMutation.error}>
          {getError => <div class="text-red-500 text-sm">{getError().message}</div>}
        </Show>

        <Checkbox class="flex items-center gap-2 mt-4" checked={trustDevice()} onChange={setTrustDevice}>
          <CheckboxControl />
          <CheckboxLabel class="text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70">
            {t('auth.login.two-factor.trust-device.label')}
          </CheckboxLabel>
        </Checkbox>
      </div>
    </div>
  );
};

const BackupCodeVerificationForm: Component = () => {
  const navigate = useNavigate();
  const { t } = useI18n();
  const [trustDevice, setTrustDevice] = createSignal(false);

  const { form, Form, Field } = createForm({
    onSubmit: async ({ code }) => {
      const { error } = await twoFactor.verifyBackupCode({
        code,
        trustDevice: trustDevice(),
      });

      if (error) {
        createToast({ type: 'error', message: t('auth.login.two-factor.verification-failed') });
        throw new Error(error.message);
      }

      navigate('/');
    },
    schema: v.object({
      code: v.pipe(
        v.string(),
        v.nonEmpty(t('auth.login.two-factor.code.required')),
      ),
    }),
    initialValues: {
      code: '',
    },
  });

  return (
    <Form>
      <p class="text-muted-foreground mt-1 mb-4">
        {t('auth.login.two-factor.description.backup-code')}
      </p>

      <Field name="code">
        {(field, inputProps) => (
          <TextFieldRoot class="flex flex-col gap-1 mb-4">
            <TextFieldLabel for="backup-code">{t('auth.login.two-factor.code.label.backup-code')}</TextFieldLabel>
            <TextField
              type="text"
              id="backup-code"
              placeholder={t('auth.login.two-factor.code.placeholder.backup-code')}
              {...inputProps}
              autoFocus
              value={field.value}
              aria-invalid={Boolean(field.error)}
            />
            {field.error && <div class="text-red-500 text-sm">{field.error}</div>}
          </TextFieldRoot>
        )}
      </Field>

      <Checkbox class="flex items-center gap-2 mb-4" checked={trustDevice()} onChange={setTrustDevice}>
        <CheckboxControl />
        <CheckboxLabel class="text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70">
          {t('auth.login.two-factor.trust-device.label')}
        </CheckboxLabel>
      </Checkbox>

      <Button type="submit" class="w-full" isLoading={form.submitting}>
        {t('auth.login.two-factor.submit')}
      </Button>

      <div class="text-red-500 text-sm mt-4">{form.response.message}</div>

    </Form>
  );
};

const TwoFactorVerificationForm: Component<{ onBack: () => void }> = (props) => {
  const [useBackupCode, setUseBackupCode] = createSignal(false);
  const { t } = useI18n();

  return (
    <div>
      <Show
        when={!useBackupCode()}
        fallback={(
          <BackupCodeVerificationForm />
        )}
      >
        <TotpVerificationForm />
      </Show>

      <div class="flex flex-col gap-2 mt-4">
        <Show
          when={!useBackupCode()}
          fallback={(
            <Button variant="link" class="p-0 h-auto text-muted-foreground" onClick={() => setUseBackupCode(false)}>
              {t('auth.login.two-factor.use-totp')}
            </Button>
          )}
        >
          <Button variant="link" class="p-0 h-auto text-muted-foreground" onClick={() => setUseBackupCode(true)}>
            {t('auth.login.two-factor.use-backup-code')}
          </Button>
        </Show>

        <Button variant="link" class="p-0 h-auto text-muted-foreground" onClick={props.onBack}>
          {t('auth.login.two-factor.back')}
        </Button>
      </div>

    </div>
  );
};

export const EmailLoginForm: Component<{ onTwoFactorRequired: () => void }> = (props) => {
  const navigate = useNavigate();
  const { config } = useConfig();
  const { t } = useI18n();
  const { createI18nApiError } = useI18nApiErrors({ t });
  const rememberedLogin = readRememberedLogin();

  const { form, Form, Field } = createForm({
    onSubmit: async ({ email, password, rememberMe }) => {
      const { data: loginResult, error } = await signIn.email({
        email,
        password,
        rememberMe,
        // This URL is where the user will be redirected after email verification
        callbackURL: buildUrl({ baseUrl: config.baseUrl, path: authPagesPaths.emailVerification }),
      });

      if (!error) {
        writeRememberedLogin({ email, rememberMe });
      }

      if (loginResult && 'twoFactorRedirect' in loginResult && loginResult.twoFactorRedirect) {
        props.onTwoFactorRequired();
        return;
      }

      if (isEmailVerificationRequiredError({ error })) {
        navigate('/email-validation-required');
      }

      if (error) {
        throw createI18nApiError({ error });
      }

      // If all good guard will redirect to dashboard
    },
    schema: v.object({
      email: v.pipe(
        v.string(),
        v.trim(),
        v.nonEmpty(t('auth.login.form.email.required')),
        v.email(t('auth.login.form.email.invalid')),
      ),
      password: v.pipe(
        v.string(t('auth.login.form.password.required')),
        v.nonEmpty(t('auth.login.form.password.required')),
      ),
      rememberMe: v.boolean(),
    }),
    initialValues: {
      email: rememberedLogin.email,
      rememberMe: rememberedLogin.rememberMe,
    },
  });

  return (
    <Form>
      <Field name="email">
        {(field, inputProps) => (
          <TextFieldRoot class="flex flex-col gap-1 mb-4">
            <TextFieldLabel for="email">{t('auth.login.form.email.label')}</TextFieldLabel>
            <TextField type="email" id="email" placeholder={t('auth.login.form.email.placeholder')} {...inputProps} autoFocus value={field.value} aria-invalid={Boolean(field.error)} />
            {field.error && <div class="text-red-500 text-sm">{field.error}</div>}
          </TextFieldRoot>
        )}
      </Field>

      <Field name="password">
        {(field, inputProps) => (
          <TextFieldRoot class="flex flex-col gap-1 mb-4">
            <TextFieldLabel for="password">{t('auth.login.form.password.label')}</TextFieldLabel>

            <PasswordField
              id="password"
              placeholder={t('auth.login.form.password.placeholder')}
              {...inputProps}
              value={field.value}
              aria-invalid={Boolean(field.error)}
              showPasswordLabel={t('auth.password.show')}
              hidePasswordLabel={t('auth.password.hide')}
            />
            {field.error && <div class="text-red-500 text-sm">{field.error}</div>}
          </TextFieldRoot>
        )}
      </Field>

      <div class="flex justify-between items-center mb-4">
        <Field name="rememberMe" type="boolean">
          {(field, inputProps) => (
            <Checkbox class="flex items-center gap-2" defaultChecked={field.value}>
              <CheckboxControl inputProps={inputProps} />
              <CheckboxLabel class="text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70">
                {t('auth.login.form.remember-me.label')}
              </CheckboxLabel>
            </Checkbox>
          )}
        </Field>

        <Show when={config.auth.isPasswordResetEnabled}>
          <Button variant="link" as={A} class="inline p-0! h-auto" href="/request-password-reset">
            {t('auth.login.form.forgot-password.label')}
          </Button>
        </Show>
      </div>

      <Button type="submit" class="w-full" isLoading={form.submitting}>{t('auth.login.form.submit')}</Button>

      <div class="text-red-500 text-sm mt-4">{form.response.message}</div>

    </Form>
  );
};

export const LoginPage: Component = () => {
  const { config } = useConfig();
  const { t } = useI18n();

  const [searchParams, setSearchParams] = useSearchParams();
  // A sign in through an OAuth provider on an account with 2FA comes back here to ask for the code
  const [showTwoFactorForm, setShowTwoFactorForm] = createSignal(searchParams['two-factor'] === 'required');

  const leaveTwoFactorForm = () => {
    setShowTwoFactorForm(false);
    setSearchParams({ 'two-factor': undefined }, { replace: true });
  };

  const loginWithProvider = async (provider: SsoProviderConfig) => {
    await authWithProvider({ provider, config });
  };

  const getHasSsoProviders = () => getEnabledSsoProviderConfigs({ config }).length > 0;

  const hasNoAuthProviders = !config.auth.providers.email.isEnabled && !getHasSsoProviders();

  return (
    <AuthBackgroundLayout>
      <Show when={!hasNoAuthProviders} fallback={<NoAuthProviderWarning />}>
        <AuthCard>
          <Show
            when={!showTwoFactorForm()}
            fallback={(
              <>
                <div class="size-11 rounded-xl bg-primary/12 text-primary grid place-items-center mb-6">
                  <span class="i-tabler-shield-lock size-5" />
                </div>
                <h1 class="text-2xl font-semibold tracking-tight">{t('auth.login.two-factor.title')}</h1>
                <TwoFactorVerificationForm onBack={leaveTwoFactorForm} />
              </>
            )}
          >
            <h1 class="text-3xl font-semibold tracking-[-0.035em]">{t('auth.login.welcome')}</h1>
            <p class="text-muted-foreground mt-2 mb-7 leading-6">{t('auth.login.welcome-description')}</p>

            <Show when={config.auth.providers.email.isEnabled}>
              <EmailLoginForm onTwoFactorRequired={() => setShowTwoFactorForm(true)} />
            </Show>

            <Show when={config.auth.providers.email.isEnabled && getHasSsoProviders()}>
              <Separator class="my-4" />
            </Show>

            <Show when={getHasSsoProviders()}>

              <div class="flex flex-col gap-2">
                <For each={getEnabledSsoProviderConfigs({ config })}>
                  {provider => (
                    <SsoProviderButton
                      name={provider.name}
                      icon={provider.icon}
                      onClick={() => loginWithProvider(provider)}
                      label={t('auth.login.login-with-provider', { provider: provider.name })}
                    />
                  )}
                </For>
              </div>
            </Show>

            <Show when={config.auth.isRegistrationEnabled}>
              <p class="text-muted-foreground mt-6 text-center text-sm">
                {t('auth.login.no-account')}
                {' '}
                <Button variant="link" as={A} class="inline px-0" href="/register">
                  {t('auth.login.register')}
                </Button>
              </p>
            </Show>

            <AuthLegalLinks />
          </Show>
        </AuthCard>
      </Show>
    </AuthBackgroundLayout>
  );
};
