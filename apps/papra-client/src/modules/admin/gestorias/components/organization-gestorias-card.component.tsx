import type { Component } from 'solid-js';
import { A } from '@solidjs/router';
import { useQuery } from '@tanstack/solid-query';
import { For, Show } from 'solid-js';
import { GESTORIA_MODULE_DEFINITIONS } from '@/modules/gestorias/gestorias.constants';
import { getClientModules } from '@/modules/gestorias/gestorias.navigation';
import { useI18n } from '@/modules/i18n/i18n.provider';
import { Badge } from '@/modules/ui/components/badge';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/modules/ui/components/card';
import { getOrganizationGestorias } from '../gestorias.services';

/** Who can read the books of a company, on its back office page; the access itself is managed on each gestoría */
export const OrganizationGestoriasCard: Component<{ organizationId: string }> = (props) => {
  const { t } = useI18n();

  const query = useQuery(() => ({
    queryKey: ['admin', 'organizations', props.organizationId, 'gestorias'],
    queryFn: () => getOrganizationGestorias({ organizationId: props.organizationId }),
  }));

  return (
    <Card>
      <CardHeader>
        <CardTitle>{t('admin.gestorias.organization.title')}</CardTitle>
        <CardDescription>{t('admin.gestorias.organization.description')}</CardDescription>
      </CardHeader>
      <CardContent>
        <Show when={(query.data?.gestorias.length ?? 0) > 0} fallback={<p class="text-sm text-muted-foreground">{t('admin.gestorias.organization.empty')}</p>}>
          <ul class="divide-y rounded-md border">
            <For each={query.data?.gestorias}>
              {gestoria => (
                <li class="flex flex-wrap items-center justify-between gap-2 px-3 py-2">
                  <A href={`/admin/gestorias/${gestoria.id}`} class="font-medium hover:underline">{gestoria.name}</A>
                  <div class="flex flex-wrap gap-1">
                    <For each={getClientModules({ client: gestoria })}>
                      {module => <Badge variant="secondary">{t(GESTORIA_MODULE_DEFINITIONS[module].labelKey)}</Badge>}
                    </For>
                  </div>
                </li>
              )}
            </For>
          </ul>
        </Show>
      </CardContent>
    </Card>
  );
};
