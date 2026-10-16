import type { Component } from 'solid-js';
import type { AdminGestoria, AdminGestoriaClient, AdminGestoriaInvitation, GestoriaInput } from '../gestorias.services';
import type { GestoriaModule } from '@/modules/gestorias/gestorias.types';
import { A, useNavigate, useParams } from '@solidjs/router';
import { createMutation, keepPreviousData, useQuery } from '@tanstack/solid-query';
import { createEffect, createSignal, For, Show } from 'solid-js';
import { GESTORIA_MODULE_DEFINITIONS, GESTORIA_MODULES } from '@/modules/gestorias/gestorias.constants';
import { RelativeTime } from '@/modules/i18n/components/RelativeTime';
import { useI18n } from '@/modules/i18n/i18n.provider';
import { FormField } from '@/modules/invoicing/components/catalog-page';
import { useConfirmModal } from '@/modules/shared/confirm';
import { useI18nApiErrors } from '@/modules/shared/http/composables/i18n-api-errors';
import { queryClient } from '@/modules/shared/query/query-client';
import { Badge } from '@/modules/ui/components/badge';
import { Button } from '@/modules/ui/components/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/modules/ui/components/card';
import { Command, CommandEmpty, CommandInput, CommandItem, CommandList } from '@/modules/ui/components/command';
import { DiceBearAvatar } from '@/modules/ui/components/dicebear-avatar';
import { Popover, PopoverContent, PopoverTrigger } from '@/modules/ui/components/popover';
import { SimpleCheckbox } from '@/modules/ui/components/simple-checkbox';
import { createToast } from '@/modules/ui/components/sonner';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/modules/ui/components/table';
import { TextField } from '@/modules/ui/components/textfield';
import { listOrganizations } from '../../organizations/organizations.services';
import { addGestoriaClient, addGestoriaMember, cancelGestoriaInvitation, deleteGestoria, getGestoria, removeGestoriaClient, removeGestoriaMember, updateGestoria, updateGestoriaClientModules } from '../gestorias.services';

const getDetailQueryKey = (gestoriaId: string) => ['admin', 'gestorias', gestoriaId];

function useRefreshGestoria(gestoriaId: () => string) {
  return async () => {
    await queryClient.invalidateQueries({ queryKey: ['admin', 'gestorias'] });
    await queryClient.invalidateQueries({ queryKey: getDetailQueryKey(gestoriaId()) });
  };
}

const GestoriaInfoCard: Component<{ gestoria: AdminGestoria }> = (props) => {
  const { t } = useI18n();
  const { getErrorMessage } = useI18nApiErrors();
  const { confirm } = useConfirmModal();
  const navigate = useNavigate();
  const refresh = useRefreshGestoria(() => props.gestoria.id);
  const [form, setForm] = createSignal<GestoriaInput>({ name: '', taxId: null, email: null });

  createEffect(() => setForm({ name: props.gestoria.name, taxId: props.gestoria.taxId, email: props.gestoria.email }));

  const saveMutation = createMutation(() => ({
    mutationFn: () => updateGestoria({ gestoriaId: props.gestoria.id, gestoria: form() }),
    onSuccess: async () => {
      await refresh();
      createToast({ type: 'success', message: t('admin.gestorias.toast.saved') });
    },
    onError: (error: unknown) => createToast({ type: 'error', message: getErrorMessage({ error, defaultMessage: t('admin.gestorias.toast.error') }) }),
  }));

  const remove = async () => {
    const isConfirmed = await confirm({
      title: t('admin.gestorias.delete.title', { name: props.gestoria.name }),
      message: t('admin.gestorias.delete.message'),
      confirmButton: { text: t('common.row-actions.delete'), variant: 'destructive' },
      cancelButton: { text: t('common.row-actions.cancel') },
    });

    if (isConfirmed) {
      await deleteGestoria({ gestoriaId: props.gestoria.id });
      await queryClient.invalidateQueries({ queryKey: ['admin', 'gestorias'] });
      navigate('/admin/gestorias');
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle>{t('admin.gestorias.info.title')}</CardTitle>
        <CardDescription>{t('admin.gestorias.info.description')}</CardDescription>
      </CardHeader>
      <CardContent>
        <form
          class="grid gap-4 sm:grid-cols-3"
          onSubmit={(event) => {
            event.preventDefault();
            saveMutation.mutate();
          }}
        >
          <FormField label={t('admin.gestorias.form.name')}>
            <TextField required value={form().name} onInput={event => setForm(current => ({ ...current, name: event.currentTarget.value }))} />
          </FormField>
          <FormField label={t('admin.gestorias.form.tax-id')}>
            <TextField value={form().taxId ?? ''} onInput={event => setForm(current => ({ ...current, taxId: event.currentTarget.value || null }))} />
          </FormField>
          <FormField label={t('admin.gestorias.form.email')}>
            <TextField type="email" value={form().email ?? ''} onInput={event => setForm(current => ({ ...current, email: event.currentTarget.value || null }))} />
          </FormField>
          <div class="flex flex-wrap justify-between gap-2 sm:col-span-3">
            <Button type="button" variant="ghost" class="gap-1.5 text-destructive hover:text-destructive" onClick={() => void remove()}>
              <div class="i-tabler-trash size-4" />
              {t('admin.gestorias.delete')}
            </Button>
            <div class="flex gap-2">
              <Button as={A} href={`/gestoria/${props.gestoria.id}/home`} variant="outline" class="gap-1.5">
                <div class="i-tabler-external-link size-4" />
                {t('admin.gestorias.open-workspace')}
              </Button>
              <Button type="submit" isLoading={saveMutation.isPending}>{t('admin.gestorias.save')}</Button>
            </div>
          </div>
        </form>
      </CardContent>
    </Card>
  );
};

const GestoriaMembersCard: Component<{ gestoriaId: string; members: { id: string; userId: string; name: string | null; email: string; createdAt: string }[]; invitations: AdminGestoriaInvitation[] }> = (props) => {
  const { t } = useI18n();
  const { getErrorMessage } = useI18nApiErrors();
  const { confirm } = useConfirmModal();
  const refresh = useRefreshGestoria(() => props.gestoriaId);
  const [email, setEmail] = createSignal('');

  const addMutation = createMutation(() => ({
    mutationFn: () => addGestoriaMember({ gestoriaId: props.gestoriaId, email: email().trim() }),
    onSuccess: async ({ invitation }) => {
      setEmail('');
      await refresh();
      createToast({
        type: 'success',
        message: invitation ? t('admin.gestorias.invitations.toast.sent', { email: invitation.email }) : t('admin.gestorias.members.toast.added'),
      });
    },
    onError: (error: unknown) => createToast({ type: 'error', message: getErrorMessage({ error, defaultMessage: t('admin.gestorias.toast.error') }) }),
  }));

  const removeMutation = createMutation(() => ({
    mutationFn: (memberId: string) => removeGestoriaMember({ gestoriaId: props.gestoriaId, memberId }),
    onSuccess: refresh,
    onError: (error: unknown) => createToast({ type: 'error', message: getErrorMessage({ error, defaultMessage: t('admin.gestorias.toast.error') }) }),
  }));

  const cancelInvitation = async (invitation: AdminGestoriaInvitation) => {
    const isConfirmed = await confirm({
      title: t('admin.gestorias.invitations.cancel.title', { email: invitation.email }),
      message: t('admin.gestorias.invitations.cancel.message'),
      confirmButton: { text: t('admin.gestorias.invitations.cancel'), variant: 'destructive' },
      cancelButton: { text: t('common.row-actions.cancel') },
    });

    if (isConfirmed) {
      await cancelGestoriaInvitation({ gestoriaId: props.gestoriaId, invitationId: invitation.id })
        .catch((error: unknown) => createToast({ type: 'error', message: getErrorMessage({ error, defaultMessage: t('admin.gestorias.toast.error') }) }));
      await refresh();
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle>{t('admin.gestorias.members.title', { count: props.members.length })}</CardTitle>
        <CardDescription>{t('admin.gestorias.members.description')}</CardDescription>
      </CardHeader>
      <CardContent class="space-y-4">
        <form
          class="flex gap-2"
          onSubmit={(event) => {
            event.preventDefault();
            addMutation.mutate();
          }}
        >
          <TextField type="email" required class="flex-1" value={email()} onInput={event => setEmail(event.currentTarget.value)} placeholder={t('admin.gestorias.members.email-placeholder')} />
          <Button type="submit" class="gap-1.5" isLoading={addMutation.isPending}>
            <div class="i-tabler-user-plus size-4" />
            {t('admin.gestorias.members.add')}
          </Button>
        </form>

        <Show when={props.members.length > 0} fallback={<p class="text-sm text-muted-foreground">{t('admin.gestorias.members.empty')}</p>}>
          <div class="rounded-md border">
            <Table>
              <TableBody>
                <For each={props.members}>
                  {member => (
                    <TableRow>
                      <TableCell>
                        <A href={`/admin/users/${member.userId}`} class="hover:underline">
                          <div class="font-medium">{member.name || member.email}</div>
                          <div class="text-xs text-muted-foreground">{member.email}</div>
                        </A>
                      </TableCell>
                      <TableCell><RelativeTime class="text-sm text-muted-foreground" date={new Date(member.createdAt)} /></TableCell>
                      <TableCell class="w-12 text-right">
                        <Button variant="ghost" size="icon" class="size-8 text-muted-foreground" aria-label={t('admin.gestorias.members.remove')} onClick={() => removeMutation.mutate(member.id)}>
                          <div class="i-tabler-x size-4" />
                        </Button>
                      </TableCell>
                    </TableRow>
                  )}
                </For>
              </TableBody>
            </Table>
          </div>
        </Show>

        <Show when={props.invitations.length > 0}>
          <div class="space-y-2">
            <h3 class="text-sm font-medium">{t('admin.gestorias.invitations.title', { count: props.invitations.length })}</h3>
            <div class="rounded-md border">
              <Table>
                <TableBody>
                  <For each={props.invitations}>
                    {invitation => (
                      <TableRow>
                        <TableCell>
                          <div class="flex items-center gap-2">
                            <div class="i-tabler-mail size-4 text-muted-foreground" />
                            <span class="font-medium">{invitation.email}</span>
                            <Show when={new Date(invitation.expiresAt) <= new Date()} fallback={<Badge variant="outline">{t('admin.gestorias.invitations.pending')}</Badge>}>
                              <Badge variant="outline" class="text-destructive">{t('admin.gestorias.invitations.expired')}</Badge>
                            </Show>
                          </div>
                        </TableCell>
                        <TableCell><RelativeTime class="text-sm text-muted-foreground" date={new Date(invitation.updatedAt)} /></TableCell>
                        <TableCell class="w-12 text-right">
                          <Button variant="ghost" size="icon" class="size-8 text-muted-foreground" aria-label={t('admin.gestorias.invitations.cancel')} onClick={() => void cancelInvitation(invitation)}>
                            <div class="i-tabler-x size-4" />
                          </Button>
                        </TableCell>
                      </TableRow>
                    )}
                  </For>
                </TableBody>
              </Table>
            </div>
          </div>
        </Show>
      </CardContent>
    </Card>
  );
};

/** Searches the companies of the platform to give the gestoría access to one of them */
const OrganizationPicker: Component<{ excludedIds: string[]; onSelect: (organization: { id: string; name: string }) => void }> = (props) => {
  const { t } = useI18n();
  const [isOpen, setIsOpen] = createSignal(false);
  const [search, setSearch] = createSignal('');

  const query = useQuery(() => ({
    queryKey: ['admin', 'organizations', 'picker', search()],
    queryFn: () => listOrganizations({ search: search() || undefined, pageSize: 20 }),
    enabled: isOpen(),
    placeholderData: keepPreviousData,
  }));

  return (
    <Popover open={isOpen()} onOpenChange={setIsOpen} placement="bottom-start">
      <PopoverTrigger as={Button} variant="outline" class="gap-1.5">
        <div class="i-tabler-building-plus size-4" />
        {t('admin.gestorias.clients.add')}
      </PopoverTrigger>
      <PopoverContent class="w-80 p-0">
        <Command shouldFilter={false}>
          <CommandInput value={search()} onValueChange={setSearch} placeholder={t('admin.organizations.search-placeholder')} />
          <CommandList>
            <CommandEmpty>{t('admin.organizations.no-results')}</CommandEmpty>
            <For each={query.data?.organizations.filter(organization => !props.excludedIds.includes(organization.id))}>
              {organization => (
                <CommandItem
                  value={organization.id}
                  class="gap-2"
                  onSelect={() => {
                    setIsOpen(false);
                    setSearch('');
                    props.onSelect(organization);
                  }}
                >
                  <DiceBearAvatar seed={organization.id} type="organization" alt="" class="size-6 shrink-0 rounded-sm border" />
                  <span class="min-w-0 flex-1">
                    <span class="block truncate">{organization.name}</span>
                    <span class="block truncate font-mono text-xs text-muted-foreground">{organization.id}</span>
                  </span>
                </CommandItem>
              )}
            </For>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
};

const GestoriaClientsCard: Component<{ gestoriaId: string; clients: AdminGestoriaClient[] }> = (props) => {
  const { t } = useI18n();
  const { getErrorMessage } = useI18nApiErrors();
  const { confirm } = useConfirmModal();
  const refresh = useRefreshGestoria(() => props.gestoriaId);
  const onError = (error: unknown) => createToast({ type: 'error', message: getErrorMessage({ error, defaultMessage: t('admin.gestorias.toast.error') }) });

  // A new client gets every module: what the company has on its books is what its gestoría keeps
  const addMutation = createMutation(() => ({
    mutationFn: (organizationId: string) => addGestoriaClient({ gestoriaId: props.gestoriaId, organizationId, modules: GESTORIA_MODULES }),
    onSuccess: async () => {
      await refresh();
      createToast({ type: 'success', message: t('admin.gestorias.clients.toast.added') });
    },
    onError,
  }));

  const modulesMutation = createMutation(() => ({
    mutationFn: ({ organizationId, modules }: { organizationId: string; modules: GestoriaModule[] }) => updateGestoriaClientModules({ gestoriaId: props.gestoriaId, organizationId, modules }),
    onSuccess: refresh,
    onError,
  }));

  const toggleModule = ({ client, module, isGranted }: { client: AdminGestoriaClient; module: GestoriaModule; isGranted: boolean }) => modulesMutation.mutate({
    organizationId: client.organizationId,
    modules: isGranted ? [...client.modules, module] : client.modules.filter(item => item !== module),
  });

  const remove = async (client: AdminGestoriaClient) => {
    const isConfirmed = await confirm({
      title: t('admin.gestorias.clients.remove.title', { name: client.name }),
      message: t('admin.gestorias.clients.remove.message'),
      confirmButton: { text: t('admin.gestorias.clients.remove'), variant: 'destructive' },
      cancelButton: { text: t('common.row-actions.cancel') },
    });

    if (isConfirmed) {
      await removeGestoriaClient({ gestoriaId: props.gestoriaId, organizationId: client.organizationId }).catch(onError);
      await refresh();
    }
  };

  return (
    <Card>
      <CardHeader class="flex-row flex-wrap items-start justify-between gap-4 space-y-0">
        <div class="space-y-1.5">
          <CardTitle>{t('admin.gestorias.clients.title', { count: props.clients.length })}</CardTitle>
          <CardDescription>{t('admin.gestorias.clients.description')}</CardDescription>
        </div>
        <OrganizationPicker excludedIds={props.clients.map(client => client.organizationId)} onSelect={organization => addMutation.mutate(organization.id)} />
      </CardHeader>
      <CardContent>
        <Show when={props.clients.length > 0} fallback={<p class="text-sm text-muted-foreground">{t('admin.gestorias.clients.empty')}</p>}>
          <div class="rounded-md border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>{t('admin.gestorias.clients.table.company')}</TableHead>
                  <TableHead>{t('admin.gestorias.clients.table.modules')}</TableHead>
                  <TableHead>{t('admin.gestorias.clients.table.since')}</TableHead>
                  <TableHead class="w-12" />
                </TableRow>
              </TableHeader>
              <TableBody>
                <For each={props.clients}>
                  {client => (
                    <TableRow>
                      <TableCell>
                        <A href={`/admin/organizations/${client.organizationId}`} class="flex items-center gap-2 hover:underline">
                          <DiceBearAvatar seed={client.organizationId} type="organization" alt="" class="size-7 rounded-md border" />
                          <div>
                            <div class="flex items-center gap-2 font-medium">
                              {client.name}
                              <Show when={client.isDeleted}>
                                <Badge variant="outline" class="text-destructive">{t('admin.gestorias.clients.deleted')}</Badge>
                              </Show>
                            </div>
                            <div class="text-xs text-muted-foreground">{client.taxId ?? client.organizationId}</div>
                          </div>
                        </A>
                      </TableCell>
                      <TableCell>
                        <div class="flex flex-wrap gap-x-4 gap-y-2">
                          <For each={GESTORIA_MODULES}>
                            {module => (
                              <SimpleCheckbox
                                checked={client.modules.includes(module)}
                                disabled={modulesMutation.isPending}
                                onChange={isGranted => toggleModule({ client, module, isGranted })}
                                label={t(GESTORIA_MODULE_DEFINITIONS[module].labelKey)}
                              />
                            )}
                          </For>
                        </div>
                      </TableCell>
                      <TableCell><RelativeTime class="text-sm text-muted-foreground" date={new Date(client.createdAt)} /></TableCell>
                      <TableCell class="text-right">
                        <Button variant="ghost" size="icon" class="size-8 text-muted-foreground" aria-label={t('admin.gestorias.clients.remove')} onClick={() => void remove(client)}>
                          <div class="i-tabler-x size-4" />
                        </Button>
                      </TableCell>
                    </TableRow>
                  )}
                </For>
              </TableBody>
            </Table>
          </div>
        </Show>
      </CardContent>
    </Card>
  );
};

export const AdminGestoriaDetailPage: Component = () => {
  const { t } = useI18n();
  const params = useParams();

  const query = useQuery(() => ({
    queryKey: getDetailQueryKey(params.gestoriaId),
    queryFn: () => getGestoria({ gestoriaId: params.gestoriaId }),
  }));

  return (
    <div class="page">
      <div class="mb-6">
        <Button as={A} href="/admin/gestorias" variant="ghost" size="sm" class="mb-4">
          <div class="i-tabler-arrow-left mr-2 size-4" />
          {t('admin.gestorias.back')}
        </Button>

        <h1 class="mb-1 text-2xl font-bold">{query.data?.gestoria.name ?? t('admin.gestorias.title')}</h1>
        <p class="font-mono text-sm text-muted-foreground">{params.gestoriaId}</p>
      </div>

      <Show when={query.data} fallback={<div class="py-8 text-center text-muted-foreground">{t('admin.organizations.loading')}</div>}>
        {data => (
          <div class="space-y-6">
            <GestoriaInfoCard gestoria={data().gestoria} />
            <GestoriaClientsCard gestoriaId={params.gestoriaId} clients={data().clients} />
            <GestoriaMembersCard gestoriaId={params.gestoriaId} members={data().members} invitations={data().invitations} />
          </div>
        )}
      </Show>
    </div>
  );
};

export default AdminGestoriaDetailPage;
