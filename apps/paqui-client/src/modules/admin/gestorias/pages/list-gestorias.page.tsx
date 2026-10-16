import type { Component } from 'solid-js';
import { A, useNavigate } from '@solidjs/router';
import { createMutation, useQuery } from '@tanstack/solid-query';
import { createSignal, For, Show } from 'solid-js';
import { RelativeTime } from '@/modules/i18n/components/RelativeTime';
import { useI18n } from '@/modules/i18n/i18n.provider';
import { FormField } from '@/modules/invoicing/components/catalog-page';
import { useI18nApiErrors } from '@/modules/shared/http/composables/i18n-api-errors';
import { queryClient } from '@/modules/shared/query/query-client';
import { Button } from '@/modules/ui/components/button';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/modules/ui/components/dialog';
import { DiceBearAvatar } from '@/modules/ui/components/dicebear-avatar';
import { createToast } from '@/modules/ui/components/sonner';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/modules/ui/components/table';
import { TableToolbar } from '@/modules/ui/components/table-toolbar';
import { TextField } from '@/modules/ui/components/textfield';
import { createGestoria, listGestorias } from '../gestorias.services';

export const AdminListGestoriasPage: Component = () => {
  const { t } = useI18n();
  const { getErrorMessage } = useI18nApiErrors();
  const navigate = useNavigate();
  const [search, setSearch] = createSignal('');
  const [isCreateOpen, setIsCreateOpen] = createSignal(false);
  const [form, setForm] = createSignal({ name: '', taxId: '', email: '' });

  const query = useQuery(() => ({
    queryKey: ['admin', 'gestorias', search()],
    queryFn: () => listGestorias({ search: search() || undefined }),
  }));

  const createGestoriaMutation = createMutation(() => ({
    mutationFn: () => createGestoria({ gestoria: { name: form().name, taxId: form().taxId || null, email: form().email || null } }),
    onSuccess: async ({ gestoria }) => {
      await queryClient.invalidateQueries({ queryKey: ['admin', 'gestorias'] });
      setIsCreateOpen(false);
      createToast({ type: 'success', message: t('admin.gestorias.toast.created') });
      navigate(`/admin/gestorias/${gestoria.id}`);
    },
    onError: (error: unknown) => createToast({ type: 'error', message: getErrorMessage({ error, defaultMessage: t('admin.gestorias.toast.error') }) }),
  }));

  return (
    <div class="page">
      <div class="mb-6 flex flex-wrap items-start justify-between gap-4 border-b pb-4">
        <div>
          <h1 class="mb-1 text-xl font-bold">{t('admin.gestorias.title')}</h1>
          <p class="text-sm text-muted-foreground">{t('admin.gestorias.description')}</p>
        </div>
        <Button
          size="sm"
          class="gap-1.5"
          onClick={() => {
            setForm({ name: '', taxId: '', email: '' });
            setIsCreateOpen(true);
          }}
        >
          <div class="i-tabler-plus size-4" />
          {t('admin.gestorias.create')}
        </Button>
      </div>

      <TableToolbar search={search()} onSearchChange={setSearch} searchPlaceholder={t('admin.gestorias.search-placeholder')} searchLoading={query.isFetching} />

      <Show when={!query.isLoading} fallback={<div class="py-8 text-center text-muted-foreground">{t('admin.organizations.loading')}</div>}>
        <Show
          when={(query.data?.gestorias.length ?? 0) > 0}
          fallback={<div class="py-8 text-center text-muted-foreground">{search() ? t('admin.organizations.no-results') : t('admin.gestorias.empty')}</div>}
        >
          <div class="border-y">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>{t('admin.gestorias.table.name')}</TableHead>
                  <TableHead>{t('admin.gestorias.table.tax-id')}</TableHead>
                  <TableHead>{t('admin.gestorias.table.members')}</TableHead>
                  <TableHead>{t('admin.gestorias.table.clients')}</TableHead>
                  <TableHead>{t('admin.gestorias.table.created')}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                <For each={query.data?.gestorias}>
                  {gestoria => (
                    <TableRow>
                      <TableCell>
                        <A href={`/admin/gestorias/${gestoria.id}`} class="flex items-center gap-2 hover:underline">
                          <DiceBearAvatar seed={gestoria.id} type="organization" alt="" class="size-7 rounded-md border" />
                          <div>
                            <div class="font-medium">{gestoria.name}</div>
                            <div class="font-mono text-xs text-muted-foreground">{gestoria.id}</div>
                          </div>
                        </A>
                      </TableCell>
                      <TableCell class="text-muted-foreground">{gestoria.taxId ?? '—'}</TableCell>
                      <TableCell>{gestoria.memberCount}</TableCell>
                      <TableCell>{gestoria.clientCount}</TableCell>
                      <TableCell><RelativeTime class="text-sm text-muted-foreground" date={new Date(gestoria.createdAt)} /></TableCell>
                    </TableRow>
                  )}
                </For>
              </TableBody>
            </Table>
          </div>
        </Show>
      </Show>

      <Dialog open={isCreateOpen()} onOpenChange={setIsCreateOpen}>
        <DialogContent class="max-w-md">
          <DialogHeader>
            <DialogTitle>{t('admin.gestorias.create')}</DialogTitle>
            <DialogDescription>{t('admin.gestorias.create.description')}</DialogDescription>
          </DialogHeader>
          <form
            class="flex flex-col gap-4"
            onSubmit={(event) => {
              event.preventDefault();
              createGestoriaMutation.mutate();
            }}
          >
            <FormField label={t('admin.gestorias.form.name')}>
              <TextField required autofocus value={form().name} onInput={event => setForm(current => ({ ...current, name: event.currentTarget.value }))} placeholder="Gestoría López S.L." />
            </FormField>
            <FormField label={t('admin.gestorias.form.tax-id')}>
              <TextField value={form().taxId} onInput={event => setForm(current => ({ ...current, taxId: event.currentTarget.value }))} placeholder="B12345678" />
            </FormField>
            <FormField label={t('admin.gestorias.form.email')}>
              <TextField type="email" value={form().email} onInput={event => setForm(current => ({ ...current, email: event.currentTarget.value }))} placeholder="hola@gestorialopez.es" />
            </FormField>
            <div class="flex justify-end gap-2">
              <Button type="button" variant="ghost" onClick={() => setIsCreateOpen(false)}>{t('common.row-actions.cancel')}</Button>
              <Button type="submit" isLoading={createGestoriaMutation.isPending}>{t('admin.gestorias.create')}</Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default AdminListGestoriasPage;
