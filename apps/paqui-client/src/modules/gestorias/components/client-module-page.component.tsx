import type { JSX } from 'solid-js';
import type { GestoriaClient, GestoriaModule } from '../gestorias.types';
import { Navigate, useParams } from '@solidjs/router';
import { Match, Switch } from 'solid-js';
import { useI18n } from '@/modules/i18n/i18n.provider';
import { useGestoria } from '../gestoria.context';
import { GESTORIA_MODULE_DEFINITIONS } from '../gestorias.constants';
import { getGestoriaClientHref, getGestoriaHomeHref } from '../gestorias.navigation';

/**
 * The frame of every module page of a client company: its header, and a redirect when the company is not a client
 * (anymore) or the module was not granted. The server refuses those reads anyway, this only avoids a broken page.
 */
export function ClientModulePage(props: {
  module: GestoriaModule;
  description: string;
  actions?: JSX.Element;
  children: (client: GestoriaClient) => JSX.Element;
}) {
  const { t } = useI18n();
  const params = useParams();
  const { getClient, isLoading } = useGestoria();
  const client = () => getClient(params.organizationId);

  return (
    <Switch>
      <Match when={isLoading()}>
        <main class="page"><div class="h-64 animate-pulse rounded-2xl bg-muted/60" /></main>
      </Match>
      <Match when={!client()}>
        <Navigate href={getGestoriaHomeHref({ gestoriaId: params.gestoriaId })} />
      </Match>
      <Match when={!client()!.modules.includes(props.module)}>
        <Navigate href={getGestoriaClientHref({ gestoriaId: params.gestoriaId, client: client()! })} />
      </Match>
      <Match when={client()}>
        {getCurrentClient => (
          <main class="page">
            <div class="page-header">
              <div class="min-w-0">
                <h1 class="page-title">{t(GESTORIA_MODULE_DEFINITIONS[props.module].labelKey)}</h1>
                <p class="page-description">
                  <span class="font-medium text-foreground">{getCurrentClient().legalName ?? getCurrentClient().name}</span>
                  {getCurrentClient().taxId ? ` · ${getCurrentClient().taxId}` : ''}
                  {' · '}
                  {props.description}
                </p>
              </div>
              {props.actions}
            </div>

            {props.children(getCurrentClient())}
          </main>
        )}
      </Match>
    </Switch>
  );
}
