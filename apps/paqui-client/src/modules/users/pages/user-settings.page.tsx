/* @refresh reload */
import type { Component } from 'solid-js';
import { useNavigate } from '@solidjs/router';
import { useQuery } from '@tanstack/solid-query';
import { createSignal, For, Show, Suspense } from 'solid-js';
import * as v from 'valibot';
import { deleteUserAiProfileKey, fetchUserAiProfile, updateUserAiProfile } from '@/modules/ai-assistant/ai-assistant.services';
import { signOut } from '@/modules/auth/auth.services';
import { useI18n } from '@/modules/i18n/i18n.provider';
import { createForm } from '@/modules/shared/form/form';
import { Button } from '@/modules/ui/components/button';
import { SettingsSection, SettingsSections } from '@/modules/ui/components/settings-section';
import { createToast } from '@/modules/ui/components/sonner';
import { TextField, TextFieldLabel, TextFieldRoot } from '@/modules/ui/components/textfield';
import { TwoFactorSection } from '../components/two-factor-card';
import { useUpdateCurrentUser } from '../users.composables';
import { nameSchema } from '../users.schemas';
import { fetchCurrentUser } from '../users.services';

const LogoutSection: Component = () => {
  const [getIsLoading, setIsLoading] = createSignal(false);
  const navigate = useNavigate();
  const { t } = useI18n();

  const handleLogout = async () => {
    setIsLoading(true);
    await signOut();
    navigate('/login');
  };

  return (
    <SettingsSection title={t('user.settings.logout.title')} description={t('user.settings.logout.description')} variant="destructive">
      <div>
        <Button onClick={handleLogout} variant="destructive" isLoading={getIsLoading()}>
          {t('user.settings.logout.button')}
        </Button>
      </div>
    </SettingsSection>
  );
};

const UserEmailSection: Component<{ email: string }> = (props) => {
  const { t } = useI18n();

  return (
    <SettingsSection title={t('user.settings.email.title')} description={t('user.settings.email.description')}>
      <TextFieldRoot>
        <TextFieldLabel for="email" class="sr-only">
          {t('user.settings.email.label')}
        </TextFieldLabel>
        <TextField id="email" value={props.email} disabled readOnly />
      </TextFieldRoot>
    </SettingsSection>
  );
};

const UpdateFullNameSection: Component<{ name: string }> = (props) => {
  const { updateCurrentUser } = useUpdateCurrentUser();
  const { t } = useI18n();

  const { form, Form, Field } = createForm({
    schema: v.object({
      name: nameSchema,
    }),
    initialValues: {
      name: props.name,
    },
    onSubmit: async ({ name }) => {
      await updateCurrentUser({
        name: name.trim(),
      });

      createToast({ type: 'success', message: t('user.settings.name.updated') });
    },
  });

  return (
    <SettingsSection title={t('user.settings.name.title')} description={t('user.settings.name.description')}>
      <Form>
        <Field name="name">
          {(field, inputProps) => (
            <TextFieldRoot class="flex flex-col gap-1">
              <TextFieldLabel for="name" class="sr-only">
                {t('user.settings.name.label')}
              </TextFieldLabel>
              <div class="flex gap-2 flex-col sm:flex-row">
                <TextField
                  type="text"
                  id="name"
                  placeholder={t('user.settings.name.placeholder')}
                  {...inputProps}
                  value={field.value}
                  aria-invalid={Boolean(field.error)}
                />
                <Button
                  type="submit"
                  isLoading={form.submitting}
                  class="flex-shrink-0"
                  disabled={field.value?.trim() === props.name}
                >
                  {t('user.settings.name.update')}
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

const AiMemorySection: Component = () => {
  const { t } = useI18n();
  const [profile, setProfile] = createSignal<Record<string, string>>({});
  const [isLoading, setIsLoading] = createSignal(true);
  const [isError, setIsError] = createSignal(false);

  // Fetch immediately when component is created (not via onMount for HMR reliability)
  fetchUserAiProfile()
    .then(data => setProfile(data.profile))
    .catch((err) => {
      console.error('[AiMemory] Failed to load profile:', err);
      setIsError(true);
    })
    .finally(() => setIsLoading(false));

  const [editingKey, setEditingKey] = createSignal<string | null>(null);
  const [editValue, setEditValue] = createSignal('');
  const [newKey, setNewKey] = createSignal('');
  const [newValue, setNewValue] = createSignal('');

  const handleUpdate = async (entries: Record<string, string>) => {
    try {
      const data = await updateUserAiProfile({ entries });
      setProfile(data.profile);
      setEditingKey(null);
      setNewKey('');
      setNewValue('');
    } catch {
      // ignore
    }
  };

  const handleDelete = async (key: string) => {
    try {
      const data = await deleteUserAiProfileKey({ key });
      setProfile(data.profile);
    } catch {
      // ignore
    }
  };

  const startEdit = (key: string, value: string) => {
    setEditingKey(key);
    setEditValue(value);
  };

  const saveEdit = (key: string) => {
    handleUpdate({ [key]: editValue() });
  };

  const addEntry = () => {
    const k = newKey().trim();
    const val = newValue().trim();
    if (k && val) {
      handleUpdate({ [k]: val });
    }
  };

  return (
    <SettingsSection title={t('user.settings.ai-memory.title')} description={t('user.settings.ai-memory.description')}>
      <Show when={!isLoading()} fallback={<div class="text-sm text-muted-foreground">{t('user.settings.ai-memory.loading')}</div>}>
        <Show when={!isError()} fallback={<p class="text-sm text-muted-foreground">{t('user.settings.ai-memory.error')}</p>}>
          <div class="flex flex-col gap-2">
            <For each={Object.entries(profile())}>
              {([key, value]) => (
                <div class="flex items-center gap-2 text-sm">
                  <span class="font-medium min-w-24 text-muted-foreground">{key}</span>
                  <Show
                    when={editingKey() === key}
                    fallback={(
                      <>
                        <span class="flex-1">{value}</span>
                        <Button variant="ghost" size="sm" aria-label={t('user.settings.ai-memory.edit')} onClick={() => startEdit(key, value)}>
                          <div class="i-tabler-edit size-4" />
                        </Button>
                        <Button variant="ghost" size="sm" aria-label={t('user.settings.ai-memory.delete')} onClick={() => handleDelete(key)}>
                          <div class="i-tabler-trash size-4" />
                        </Button>
                      </>
                    )}
                  >
                    <TextFieldRoot class="flex-1 flex">
                      <TextField
                        type="text"
                        value={editValue()}
                        onInput={e => setEditValue(e.currentTarget.value)}
                        class="flex-1 min-w-0"
                      />
                    </TextFieldRoot>
                    <Button size="sm" onClick={() => saveEdit(key)}>{t('user.settings.ai-memory.save')}</Button>
                    <Button variant="ghost" size="sm" onClick={() => setEditingKey(null)}>{t('user.settings.ai-memory.cancel')}</Button>
                  </Show>
                </div>
              )}
            </For>

            <Show when={Object.keys(profile()).length === 0}>
              <p class="text-sm text-muted-foreground">{t('user.settings.ai-memory.empty')}</p>
            </Show>

            <div class="flex items-center gap-2 mt-2 pt-2 border-t">
              <TextFieldRoot class="min-w-24 max-w-32 flex">
                <TextField
                  type="text"
                  placeholder={t('user.settings.ai-memory.key')}
                  value={newKey()}
                  onInput={e => setNewKey(e.currentTarget.value)}
                  class="w-full text-sm"
                />
              </TextFieldRoot>
              <TextFieldRoot class="flex-1 flex">
                <TextField
                  type="text"
                  placeholder={t('user.settings.ai-memory.value')}
                  value={newValue()}
                  onInput={e => setNewValue(e.currentTarget.value)}
                  class="w-full text-sm"
                />
              </TextFieldRoot>
              <Button size="sm" onClick={addEntry} disabled={!newKey().trim() || !newValue().trim()}>{t('user.settings.ai-memory.add')}</Button>
            </div>
          </div>
        </Show>
      </Show>
    </SettingsSection>
  );
};

export const UserSettingsPage: Component = () => {
  const { t } = useI18n();
  const query = useQuery(() => ({
    queryKey: ['users', 'me'],
    queryFn: fetchCurrentUser,
  }));

  return (
    <div class="page-narrow">
      <Suspense>
        <Show when={query.data?.user}>
          {getUser => (
            <>
              <div class="page-header">
                <div>
                  <h1 class="page-title">{t('user.settings.title')}</h1>
                  <p class="page-description">{t('user.settings.description')}</p>
                </div>
              </div>

              <SettingsSections>
                <UserEmailSection email={getUser().email} />
                <UpdateFullNameSection name={getUser().name} />
                <TwoFactorSection twoFactorEnabled={getUser().twoFactorEnabled} onUpdate={() => query.refetch()} />
                <AiMemorySection />
                <LogoutSection />
              </SettingsSections>
            </>
          )}
        </Show>
      </Suspense>
    </div>
  );
};
