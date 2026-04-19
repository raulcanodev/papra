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
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/modules/ui/components/card';
import { createToast } from '@/modules/ui/components/sonner';
import { TextField, TextFieldLabel, TextFieldRoot } from '@/modules/ui/components/textfield';
import { TwoFactorCard } from '../components/two-factor-card';
import { useUpdateCurrentUser } from '../users.composables';
import { nameSchema } from '../users.schemas';
import { fetchCurrentUser } from '../users.services';

const LogoutCard: Component = () => {
  const [getIsLoading, setIsLoading] = createSignal(false);
  const navigate = useNavigate();
  const { t } = useI18n();

  const handleLogout = async () => {
    setIsLoading(true);
    await signOut();
    navigate('/login');
  };

  return (
    <Card class="flex flex-row justify-between items-center p-6 border-destructive">
      <div class="flex flex-col gap-1.5">
        <CardTitle>{t('user.settings.logout.title')}</CardTitle>
        <CardDescription>
          {t('user.settings.logout.description')}
        </CardDescription>
      </div>
      <Button onClick={handleLogout} variant="destructive" isLoading={getIsLoading()}>
        {t('user.settings.logout.button')}
      </Button>
    </Card>
  );
};

const UserEmailCard: Component<{ email: string }> = (props) => {
  const { t } = useI18n();

  return (
    <Card>
      <CardHeader class="border-b">
        <CardTitle>{t('user.settings.email.title')}</CardTitle>
        <CardDescription>{t('user.settings.email.description')}</CardDescription>
      </CardHeader>
      <CardContent class="pt-6">
        <TextFieldRoot>
          <TextFieldLabel for="email" class="sr-only">
            {t('user.settings.email.label')}
          </TextFieldLabel>
          <TextField id="email" value={props.email} disabled readOnly />
        </TextFieldRoot>
      </CardContent>
    </Card>
  );
};

const UpdateFullNameCard: Component<{ name: string }> = (props) => {
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
    <Card>
      <CardHeader class="border-b">
        <CardTitle>{t('user.settings.name.title')}</CardTitle>
        <CardDescription>{t('user.settings.name.description')}</CardDescription>
      </CardHeader>

      <Form>
        <CardContent class="pt-6">
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
        </CardContent>
      </Form>
    </Card>
  );
};

const AiMemoryCard: Component = () => {
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
    <Card>
      <CardHeader class="border-b">
        <CardTitle>AI Memory</CardTitle>
        <CardDescription>
          Facts the AI has learned about you from conversations. You can edit or remove any entry.
        </CardDescription>
      </CardHeader>
      <CardContent class="pt-4">
        <Show when={!isLoading()} fallback={<div class="text-sm text-muted-foreground">Loading...</div>}>
          <Show when={!isError()} fallback={<p class="text-sm text-muted-foreground">Could not load AI memory.</p>}>
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
                          <Button variant="ghost" size="sm" onClick={() => startEdit(key, value)}>
                            <div class="i-tabler-edit size-4" />
                          </Button>
                          <Button variant="ghost" size="sm" onClick={() => handleDelete(key)}>
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
                      <Button size="sm" onClick={() => saveEdit(key)}>Save</Button>
                      <Button variant="ghost" size="sm" onClick={() => setEditingKey(null)}>Cancel</Button>
                    </Show>
                  </div>
                )}
              </For>

              <Show when={Object.keys(profile()).length === 0}>
                <p class="text-sm text-muted-foreground">No entries yet. The AI will learn about you as you chat.</p>
              </Show>

              <div class="flex items-center gap-2 mt-2 pt-2 border-t">
                <TextFieldRoot class="min-w-24 max-w-32 flex">
                  <TextField
                    type="text"
                    placeholder="Key"
                    value={newKey()}
                    onInput={e => setNewKey(e.currentTarget.value)}
                    class="w-full text-sm"
                  />
                </TextFieldRoot>
                <TextFieldRoot class="flex-1 flex">
                  <TextField
                    type="text"
                    placeholder="Value"
                    value={newValue()}
                    onInput={e => setNewValue(e.currentTarget.value)}
                    class="w-full text-sm"
                  />
                </TextFieldRoot>
                <Button size="sm" onClick={addEntry} disabled={!newKey().trim() || !newValue().trim()}>Add</Button>
              </div>
            </div>
          </Show>
        </Show>
      </CardContent>
    </Card>
  );
};

export const UserSettingsPage: Component = () => {
  const { t } = useI18n();
  const query = useQuery(() => ({
    queryKey: ['users', 'me'],
    queryFn: fetchCurrentUser,
  }));

  return (
    <div class="p-6 mt-12 pb-32 mx-auto max-w-xl">
      <Suspense>
        <Show when={query.data?.user}>
          {getUser => (
            <>
              <div class="border-b pb-4">
                <h1 class="text-2xl font-semibold mb-1">{t('user.settings.title')}</h1>
                <p class="text-muted-foreground">{t('user.settings.description')}</p>
              </div>

              <div class="mt-6 flex flex-col gap-6">
                <UserEmailCard email={getUser().email} />
                <UpdateFullNameCard name={getUser().name} />
                <TwoFactorCard twoFactorEnabled={getUser().twoFactorEnabled} onUpdate={() => query.refetch()} />
                <AiMemoryCard />
                <LogoutCard />
              </div>
            </>
          )}
        </Show>
      </Suspense>
    </div>
  );
};
