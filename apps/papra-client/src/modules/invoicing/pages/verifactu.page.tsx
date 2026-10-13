import { useParams } from '@solidjs/router';
import { useQuery } from '@tanstack/solid-query';
import { For, Show } from 'solid-js';
import { useI18n } from '@/modules/i18n/i18n.provider';
import { Badge } from '@/modules/ui/components/badge';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/modules/ui/components/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/modules/ui/components/table';
import { fetchVerifactuConfiguration, fetchVerifactuRecords } from '../invoicing.services';

export const verifactuModeLabelKeys = { disabled: 'verifactu.mode.disabled', test: 'verifactu.mode.test', production: 'verifactu.mode.production', not_applicable: 'verifactu.mode.not_applicable' } as const;

export function VerifactuPage() {
  const { t, getLocale } = useI18n();
  const params = useParams<{ organizationId: string }>();
  const configuration = useQuery(() => ({ queryKey: ['invoicing', params.organizationId, 'verifactu', 'configuration'], queryFn: () => fetchVerifactuConfiguration({ organizationId: params.organizationId }) }));
  const records = useQuery(() => ({ queryKey: ['invoicing', params.organizationId, 'verifactu', 'records'], queryFn: () => fetchVerifactuRecords({ organizationId: params.organizationId }) }));

  return (
    <main class="page space-y-6">
      <div>
        <h1 class="page-title">VERI*FACTU</h1>
        <p class="page-description">{t('verifactu.page.description')}</p>
      </div>
      <Card>
        <CardHeader>
          <CardTitle>{t('verifactu.page.status.title')}</CardTitle>
          <CardDescription>{t('verifactu.page.status.description')}</CardDescription>
        </CardHeader>
        <CardContent>
          <Show when={configuration.data?.configuration} fallback={<p class="text-sm text-muted-foreground">{t('verifactu.page.not-configured')}</p>}>
            {config => (
              <div class="grid gap-4 sm:grid-cols-3">
                <div>
                  <p class="text-xs text-muted-foreground">{t('verifactu.page.mode')}</p>
                  <Badge class="mt-1">{t(verifactuModeLabelKeys[config().mode])}</Badge>
                </div>
                <div>
                  <p class="text-xs text-muted-foreground">{t('verifactu.page.issuer-tax-id')}</p>
                  <p class="mt-1 text-sm font-medium">{config().taxId ?? t('verifactu.page.pending')}</p>
                </div>
                <div>
                  <p class="text-xs text-muted-foreground">{t('verifactu.page.queue')}</p>
                  <p class="mt-1 text-sm font-medium">{config().transmissionsPaused ? t('verifactu.page.queue.paused') : t('verifactu.page.queue.recording')}</p>
                </div>
              </div>
            )}
          </Show>
        </CardContent>
      </Card>
      <Card>
        <CardHeader>
          <CardTitle>{t('verifactu.page.records.title')}</CardTitle>
          <CardDescription>{t('verifactu.page.records.description')}</CardDescription>
        </CardHeader>
        <CardContent>
          <Show when={(records.data?.records.length ?? 0) > 0} fallback={<p class="text-sm text-muted-foreground">{t('verifactu.page.records.empty')}</p>}>
            <div class="overflow-x-auto rounded-md border">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>{t('verifactu.page.records.date')}</TableHead>
                    <TableHead>{t('verifactu.page.records.type')}</TableHead>
                    <TableHead>{t('verifactu.page.records.status')}</TableHead>
                    <TableHead>{t('verifactu.page.records.hash')}</TableHead>
                    <TableHead>{t('verifactu.page.records.attempts')}</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  <For each={records.data?.records}>
                    {record => (
                      <TableRow>
                        <TableCell>{record.generatedAt.toLocaleString(getLocale())}</TableCell>
                        <TableCell>{record.recordType}</TableCell>
                        <TableCell><Badge variant="outline">{record.status}</Badge></TableCell>
                        <TableCell class="font-mono text-xs">
                          {record.hash.slice(0, 14)}
                          …
                        </TableCell>
                        <TableCell>{record.attemptCount}</TableCell>
                      </TableRow>
                    )}
                  </For>
                </TableBody>
              </Table>
            </div>
          </Show>
        </CardContent>
      </Card>
    </main>
  );
}

export default VerifactuPage;
