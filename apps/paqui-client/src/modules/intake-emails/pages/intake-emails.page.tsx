import type { DialogTriggerProps } from '@kobalte/core/dialog';
import type { Component, JSX } from 'solid-js';
import type { IntakeEmail, IntakeEmailDelivery } from '../intake-emails.types';
import { safely } from '@corentinth/chisels';
import { useParams } from '@solidjs/router';
import { useQuery } from '@tanstack/solid-query';
import { createSignal, For, Show, Suspense } from 'solid-js';
import * as v from 'valibot';
import { useConfig } from '@/modules/config/config.provider';
import { useI18n } from '@/modules/i18n/i18n.provider';
import { useConfirmModal } from '@/modules/shared/confirm';
import { createForm } from '@/modules/shared/form/form';
import { useI18nApiErrors } from '@/modules/shared/http/composables/i18n-api-errors';
import { queryClient } from '@/modules/shared/query/query-client';
import { cn } from '@/modules/shared/style/cn';
import { Badge } from '@/modules/ui/components/badge';
import { Button } from '@/modules/ui/components/button';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from '@/modules/ui/components/dialog';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/modules/ui/components/dropdown-menu';
import { EmptyState } from '@/modules/ui/components/empty';
import { SettingsSection, SettingsSections } from '@/modules/ui/components/settings-section';
import { createToast } from '@/modules/ui/components/sonner';
import { TextField, TextFieldDescription, TextFieldLabel, TextFieldRoot } from '@/modules/ui/components/textfield';
import { createIntakeEmail, deleteIntakeEmail, fetchIntakeEmails, updateIntakeEmail } from '../intake-emails.services';

const AllowedOriginsDialog: Component<{
  children: (props: DialogTriggerProps) => JSX.Element;
  intakeEmail: IntakeEmail;
  open?: boolean;
  onOpenChange?: (isOpen: boolean) => void;
}> = (props) => {
  const [getAllowedOrigins, setAllowedOrigins] = createSignal(props.intakeEmail.allowedOrigins);
  const { t } = useI18n();

  const persist = async (allowedOrigins: string[]) => updateIntakeEmail({
    organizationId: props.intakeEmail.organizationId,
    intakeEmailId: props.intakeEmail.id,
    allowedOrigins,
  });

  const deleteAllowedOrigin = async ({ origin }: { origin: string }) => {
    const allowedOrigins = getAllowedOrigins().filter(candidate => candidate !== origin);
    setAllowedOrigins(allowedOrigins);
    await persist(allowedOrigins);
  };

  const { form, Form, Field } = createForm({
    schema: v.object({ email: v.pipe(v.string(), v.trim(), v.rfcEmail(t('intake-emails.allowed-origins.add.error.invalid'))) }),
    onSubmit: async ({ email }) => {
      const normalizedEmail = email.toLowerCase();
      if (getAllowedOrigins().includes(normalizedEmail)) {
        throw new Error(t('intake-emails.allowed-origins.add.error.exists'));
      }
      const allowedOrigins = [...getAllowedOrigins(), normalizedEmail];
      setAllowedOrigins(allowedOrigins);
      await persist(allowedOrigins);
    },
  });

  return (
    <Dialog
      open={props.open}
      onOpenChange={(isOpen) => {
        if (!isOpen) {
          void queryClient.invalidateQueries({ queryKey: ['organizations', props.intakeEmail.organizationId, 'intake-emails'] });
        }
        props.onOpenChange?.(isOpen);
      }}
    >
      <DialogTrigger as={props.children} />
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{t('intake-emails.allowed-origins.title')}</DialogTitle>
          <DialogDescription>{t('intake-emails.allowed-origins.description', { email: props.intakeEmail.emailAddress })}</DialogDescription>
        </DialogHeader>
        <Form class="mt-4">
          <Field name="email">
            {(field, inputProps) => (
              <TextFieldRoot>
                <TextFieldLabel for="allowed-origin">{t('intake-emails.allowed-origins.add.label')}</TextFieldLabel>
                <div class="flex items-center gap-2">
                  <TextField id="allowed-origin" type="email" placeholder={t('intake-emails.allowed-origins.add.placeholder')} {...inputProps} value={field.value} aria-invalid={Boolean(field.error)} />
                  <Button type="submit">
                    <div class="i-tabler-plus mr-2 size-4" />
                    {t('intake-emails.allowed-origins.add.button')}
                  </Button>
                </div>
                <Show when={field.error}><div class="text-sm text-destructive">{field.error}</div></Show>
                <Show when={form.response.message}><div class="text-sm text-destructive">{form.response.message}</div></Show>
              </TextFieldRoot>
            )}
          </Field>
        </Form>
        <div class="mt-4 divide-y border-y">
          <For each={getAllowedOrigins()} fallback={<p class="py-4 text-sm text-muted-foreground">{t('intake-emails.allowed-origins.empty')}</p>}>
            {origin => (
              <div class="flex items-center justify-between gap-3 py-3">
                <span class="min-w-0 truncate text-sm">{origin}</span>
                <Button variant="ghost" size="icon" class="text-destructive" aria-label={t('intake-emails.delete-origin')} onClick={() => deleteAllowedOrigin({ origin })}>
                  <div class="i-tabler-trash size-4" />
                </Button>
              </div>
            )}
          </For>
        </div>
      </DialogContent>
    </Dialog>
  );
};

const CreateAddressDialog: Component<{ domain: string | null; onCreate: (alias: string) => Promise<void> }> = (props) => {
  const { t } = useI18n();
  const [open, setOpen] = createSignal(false);
  const { Form, Field } = createForm({
    schema: v.object({
      alias: v.pipe(
        v.string(),
        v.trim(),
        v.minLength(3, t('intake-emails.create.alias.error.length')),
        v.maxLength(48, t('intake-emails.create.alias.error.length')),
        v.regex(/^[a-z0-9](?:[\w.-]*[a-z0-9])?$/i, t('intake-emails.create.alias.error.format')),
      ),
    }),
    onSubmit: async ({ alias }) => {
      await props.onCreate(alias.toLowerCase());
      setOpen(false);
    },
  });

  return (
    <Dialog open={open()} onOpenChange={setOpen}>
      <DialogTrigger as={Button}>
        <div class="i-tabler-plus mr-2 size-4" />
        {t('intake-emails.new')}
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{t('intake-emails.create.title')}</DialogTitle>
          <DialogDescription>{t('intake-emails.create.description')}</DialogDescription>
        </DialogHeader>
        <Form class="mt-4 space-y-4">
          <Field name="alias">
            {(field, inputProps) => (
              <TextFieldRoot>
                <TextFieldLabel for="intake-alias">{t('intake-emails.create.alias.label')}</TextFieldLabel>
                <div class="flex items-center rounded-md border border-input bg-field focus-within:(border-ring ring-3 ring-ring/30)">
                  <input id="intake-alias" class="h-9 min-w-0 flex-1 bg-transparent px-3 text-sm outline-none" placeholder={t('intake-emails.create.alias.placeholder')} autocomplete="off" {...inputProps} value={field.value} aria-invalid={Boolean(field.error)} />
                  <Show when={props.domain}>
                    {domain => (
                      <span class="border-l px-3 text-sm text-muted-foreground">
                        @
                        {domain()}
                      </span>
                    )}
                  </Show>
                </div>
                <TextFieldDescription>{t('intake-emails.create.alias.help')}</TextFieldDescription>
                <Show when={field.error}><div class="text-xs text-destructive">{field.error}</div></Show>
              </TextFieldRoot>
            )}
          </Field>
          <div class="flex justify-end gap-2">
            <Button type="button" variant="outline" onClick={() => setOpen(false)}>{t('intake-emails.create.cancel')}</Button>
            <Button type="submit">{t('intake-emails.create.submit')}</Button>
          </div>
        </Form>
      </DialogContent>
    </Dialog>
  );
};

function deliveryPresentation({ delivery, t }: { delivery: IntakeEmailDelivery; t: ReturnType<typeof useI18n>['t'] }) {
  return ({
    processed: { label: t('intake-emails.activity.processed'), icon: 'i-tabler-file-invoice', variant: 'success' as const },
    no_attachments: { label: t('intake-emails.activity.no-attachments'), icon: 'i-tabler-paperclip-off', variant: 'secondary' as const },
    blocked_sender: { label: t('intake-emails.activity.blocked-sender'), icon: 'i-tabler-shield-x', variant: 'warning' as const },
    address_disabled: { label: t('intake-emails.activity.address-disabled'), icon: 'i-tabler-mail-off', variant: 'secondary' as const },
  })[delivery.status];
}

export const IntakeEmailsPage: Component = () => {
  const { config } = useConfig();
  const { t, formatDate } = useI18n();
  const params = useParams();
  const { confirm } = useConfirmModal();
  const { getErrorMessage } = useI18nApiErrors({ t });
  const [selectedIntakeEmail, setSelectedIntakeEmail] = createSignal<IntakeEmail | null>(null);
  const [openDropdownId, setOpenDropdownId] = createSignal<string | null>(null);
  const query = useQuery(() => ({
    queryKey: ['organizations', params.organizationId, 'intake-emails'],
    queryFn: () => fetchIntakeEmails({ organizationId: params.organizationId }),
    enabled: config.intakeEmails.isEnabled,
  }));

  const createEmail = async (alias: string) => {
    const [, error] = await safely(createIntakeEmail({ organizationId: params.organizationId, alias }));
    if (error) {
      createToast({ message: getErrorMessage({ error }), type: 'error' });
      throw error;
    }
    await query.refetch();
    createToast({ message: t('intake-emails.create.success'), type: 'success' });
  };

  const deleteEmail = async ({ intakeEmailId }: { intakeEmailId: string }) => {
    const confirmed = await confirm({
      title: t('intake-emails.delete.confirm.title'),
      message: t('intake-emails.delete.confirm.message'),
      cancelButton: { text: t('intake-emails.delete.confirm.cancel-button') },
      confirmButton: { text: t('intake-emails.delete.confirm.confirm-button'), variant: 'destructive' },
    });
    if (!confirmed) {
      return;
    }
    await deleteIntakeEmail({ organizationId: params.organizationId, intakeEmailId });
    await query.refetch();
    createToast({ message: t('intake-emails.delete.success'), type: 'success' });
  };

  const updateEmail = async ({ intakeEmailId, isEnabled }: { intakeEmailId: string; isEnabled: boolean }) => {
    await updateIntakeEmail({ organizationId: params.organizationId, intakeEmailId, isEnabled });
    await query.refetch();
    createToast({ message: isEnabled ? t('intake-emails.update.success.enabled') : t('intake-emails.update.success.disabled'), type: 'success' });
  };

  const copyAddress = async (emailAddress: string) => {
    await navigator.clipboard.writeText(emailAddress);
    createToast({ message: t('intake-emails.copy.success'), type: 'success' });
  };

  if (!config.intakeEmails.isEnabled) {
    return (
      <div class="page-narrow">
        <h1 class="text-xl font-semibold">{t('intake-emails.title')}</h1>
        <p class="mt-1 text-muted-foreground">{t('intake-emails.description')}</p>
        <div class="mt-6 flex items-center gap-4 border-y py-6">
          <div class="i-tabler-mail-off size-9 text-muted-foreground" />
          <div>
            <h2 class="font-medium">{t('intake-emails.disabled.title')}</h2>
            <p class="text-sm text-muted-foreground">{t('intake-emails.disabled.description')}</p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div class="page-narrow">
      <h1 class="text-xl font-semibold">{t('intake-emails.title')}</h1>
      <p class="mt-1 text-muted-foreground">{t('intake-emails.description')}</p>
      <Suspense>
        <SettingsSections class="mt-6">
          <SettingsSection title={t('intake-emails.receiving.title')} description={t('intake-emails.receiving.description')}>
            <Show when={query.data}>
              {data => (
                <>
                  <Show when={data().intakeEmails.length > 0} fallback={<div class="rounded-lg border-2 border-dashed py-7"><EmptyState title={t('intake-emails.empty.title')} description={t('intake-emails.empty.description')} class="pt-0" icon="i-tabler-mail-forward" /></div>}>
                    <div class="divide-y border-y">
                      <For each={data().intakeEmails}>
                        {intakeEmail => (
                          <div class="flex items-center justify-between gap-3 py-4">
                            <button class="min-w-0 text-left" onClick={() => void copyAddress(intakeEmail.emailAddress)} title={t('intake-emails.copy')}>
                              <div class="flex items-center gap-2">
                                <span class="truncate font-medium">{intakeEmail.emailAddress}</span>
                                <div class="i-tabler-copy size-3.5 shrink-0 text-muted-foreground" />
                                <Show when={!intakeEmail.isEnabled}><Badge variant="secondary">{t('intake-emails.disabled-label')}</Badge></Show>
                              </div>
                              <p class={cn('mt-1 text-xs', intakeEmail.allowedOrigins.length ? 'text-muted-foreground' : 'text-warning')}>
                                {intakeEmail.allowedOrigins.length ? t('intake-emails.allowed-origins', { count: intakeEmail.allowedOrigins.length, plural: intakeEmail.allowedOrigins.length > 1 ? 'es' : '' }) : t('intake-emails.no-origins')}
                              </p>
                            </button>
                            <DropdownMenu open={openDropdownId() === intakeEmail.id} onOpenChange={isOpen => setOpenDropdownId(isOpen ? intakeEmail.id : null)}>
                              <DropdownMenuTrigger as={Button} variant="ghost" size="icon" aria-label={t('intake-emails.more-actions')}><div class="i-tabler-dots-vertical size-4" /></DropdownMenuTrigger>
                              <DropdownMenuContent>
                                <DropdownMenuItem onClick={() => {
                                  setOpenDropdownId(null);
                                  void copyAddress(intakeEmail.emailAddress);
                                }}
                                >
                                  <div class="i-tabler-copy mr-2 size-4" />
                                  {t('intake-emails.copy')}
                                </DropdownMenuItem>
                                <DropdownMenuItem onClick={() => {
                                  setOpenDropdownId(null);
                                  setSelectedIntakeEmail(intakeEmail);
                                }}
                                >
                                  <div class="i-tabler-users mr-2 size-4" />
                                  {t('intake-emails.actions.manage-origins')}
                                </DropdownMenuItem>
                                <DropdownMenuItem onClick={() => {
                                  setOpenDropdownId(null);
                                  void updateEmail({ intakeEmailId: intakeEmail.id, isEnabled: !intakeEmail.isEnabled });
                                }}
                                >
                                  <div class="i-tabler-power mr-2 size-4" />
                                  {intakeEmail.isEnabled ? t('intake-emails.actions.disable') : t('intake-emails.actions.enable')}
                                </DropdownMenuItem>
                                <DropdownMenuItem
                                  class="text-destructive"
                                  onClick={() => {
                                    setOpenDropdownId(null);
                                    void deleteEmail({ intakeEmailId: intakeEmail.id });
                                  }}
                                >
                                  <div class="i-tabler-trash mr-2 size-4" />
                                  {t('intake-emails.actions.delete')}
                                </DropdownMenuItem>
                              </DropdownMenuContent>
                            </DropdownMenu>
                          </div>
                        )}
                      </For>
                    </div>
                  </Show>
                  <div class="flex justify-end"><CreateAddressDialog domain={data().domain} onCreate={createEmail} /></div>
                </>
              )}
            </Show>
          </SettingsSection>
          <SettingsSection title={t('intake-emails.connected.title')} description={t('intake-emails.connected.description')} aside={<Badge variant="secondary">{t('intake-emails.connected.soon')}</Badge>}>
            <div class="flex items-center justify-between gap-4 py-1">
              <div class="flex items-center gap-3">
                <div class="i-tabler-brand-google size-5" />
                <div>
                  <p class="text-sm font-medium">Gmail</p>
                  <p class="text-xs text-muted-foreground">Google Workspace</p>
                </div>
              </div>
              <Button variant="outline" disabled>{t('intake-emails.connected.connect')}</Button>
            </div>
            <div class="flex items-center justify-between gap-4 border-t pt-4">
              <div class="flex items-center gap-3">
                <div class="i-tabler-brand-windows size-5" />
                <div>
                  <p class="text-sm font-medium">Microsoft Outlook</p>
                  <p class="text-xs text-muted-foreground">Microsoft 365</p>
                </div>
              </div>
              <Button variant="outline" disabled>{t('intake-emails.connected.connect')}</Button>
            </div>
          </SettingsSection>
          <SettingsSection title={t('intake-emails.activity.title')} description={t('intake-emails.activity.description')}>
            <Show when={query.data?.deliveries.length} fallback={<p class="py-2 text-sm text-muted-foreground">{t('intake-emails.activity.empty')}</p>}>
              <div class="divide-y border-y">
                <For each={query.data?.deliveries}>
                  {(delivery) => {
                    const presentation = deliveryPresentation({ delivery, t });
                    return (
                      <div class="flex items-start justify-between gap-4 py-3">
                        <div class="flex min-w-0 items-start gap-3">
                          <div class={cn(presentation.icon, 'mt-0.5 size-4 shrink-0 text-muted-foreground')} />
                          <div class="min-w-0">
                            <p class="truncate text-sm font-medium">{delivery.subject || t('intake-emails.activity.no-subject')}</p>
                            <p class="truncate text-xs text-muted-foreground">
                              {delivery.fromAddress}
                              {' '}
                              ·
                              {' '}
                              {formatDate(delivery.createdAt, { dateStyle: 'short', timeStyle: 'short' })}
                            </p>
                          </div>
                        </div>
                        <Badge variant={presentation.variant} class="shrink-0">{presentation.label}</Badge>
                      </div>
                    );
                  }}
                </For>
              </div>
            </Show>
          </SettingsSection>
        </SettingsSections>
      </Suspense>
      <Show when={selectedIntakeEmail()}>
        {intakeEmail => <AllowedOriginsDialog intakeEmail={intakeEmail()} open onOpenChange={isOpen => !isOpen && setSelectedIntakeEmail(null)}>{() => <div />}</AllowedOriginsDialog>}
      </Show>
    </div>
  );
};
