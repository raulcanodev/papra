import { createMutation, useQuery } from '@tanstack/solid-query';
import { createEffect, createSignal, For } from 'solid-js';
import { useI18n } from '@/modules/i18n/i18n.provider';
import { queryClient } from '@/modules/shared/query/query-client';
import { Button } from '@/modules/ui/components/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/modules/ui/components/card';
import { SimpleCheckbox } from '@/modules/ui/components/simple-checkbox';
import { createToast } from '@/modules/ui/components/sonner';
import { TextArea } from '@/modules/ui/components/textarea';
import { getVerifactuDashboard, updateVerifactuSystemState } from './verifactu.services';

export function AdminVerifactuPage() {
  const { t } = useI18n();
  const query = useQuery(() => ({ queryKey: ['admin', 'verifactu'], queryFn: getVerifactuDashboard }));
  const [paused, setPaused] = createSignal(false);
  const [reason, setReason] = createSignal('');
  createEffect(() => {
    setPaused(query.data?.state.dispatchPaused ?? false);
    setReason(query.data?.state.reason ?? '');
  });
  const mutation = createMutation(() => ({
    mutationFn: () => updateVerifactuSystemState({ dispatchPaused: paused(), reason: reason() || null }),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['admin', 'verifactu'] });
      createToast({ type: 'success', message: t('admin.verifactu.toast.saved') });
    },
    onError: () => createToast({ type: 'error', message: t('admin.verifactu.toast.error') }),
  }));
  const metrics = () => [
    [t('admin.verifactu.metrics.active'), query.data?.activeOrganizations ?? 0],
    [t('admin.verifactu.metrics.pending'), query.data?.counts.pending ?? 0],
    [t('admin.verifactu.metrics.accepted'), query.data?.counts.accepted ?? 0],
    [t('admin.verifactu.metrics.rejected'), query.data?.counts.rejected ?? 0],
  ] as const;

  return (
    <main class="page space-y-6">
      <div>
        <h1 class="page-title">VERI*FACTU</h1>
        <p class="page-description">{t('admin.verifactu.description')}</p>
      </div>
      <div class="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <For each={metrics()}>
          {metric => (
            <Card>
              <CardHeader class="pb-2">
                <CardDescription>{metric[0]}</CardDescription>
                <CardTitle class="text-3xl">{metric[1]}</CardTitle>
              </CardHeader>
            </Card>
          )}
        </For>
      </div>
      <Card>
        <CardHeader>
          <CardTitle>{t('admin.verifactu.kill-switch.title')}</CardTitle>
          <CardDescription>{t('admin.verifactu.kill-switch.description')}</CardDescription>
        </CardHeader>
        <CardContent class="space-y-4">
          <SimpleCheckbox class="gap-3 font-medium" checked={paused()} onChange={setPaused} label={t('admin.verifactu.kill-switch.pause')} />
          <label class="block text-sm font-medium">
            {t('admin.verifactu.kill-switch.reason')}
            <TextArea class="mt-1.5" value={reason()} onInput={event => setReason(event.currentTarget.value)} placeholder={t('admin.verifactu.kill-switch.reason.placeholder')} />
          </label>
          <div class="flex justify-end"><Button onClick={() => mutation.mutate()} isLoading={mutation.isPending}>{t('admin.verifactu.kill-switch.save')}</Button></div>
        </CardContent>
      </Card>
      <p class="text-xs text-muted-foreground">{t('admin.verifactu.note.per-company')}</p>
      <p class="text-xs text-amber-700 dark:text-amber-300">{t('admin.verifactu.note.production')}</p>
    </main>
  );
}

export default AdminVerifactuPage;
