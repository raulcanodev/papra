import type { RouteDefinition } from '@solidjs/router';
import type { Component } from 'solid-js';
import type { GestoriaModule } from './gestorias.types';
import { Navigate, useParams } from '@solidjs/router';
import { lazy, Show } from 'solid-js';
import { NotFoundPage } from '../shared/pages/not-found.page';
import { useGestoria } from './gestoria.context';
import { GESTORIA_ID_PATTERN, GESTORIA_MODULE_DEFINITIONS, GESTORIA_MODULES } from './gestorias.constants';
import { getGestoriaClientHref } from './gestorias.navigation';

// The page of each module of a client company, loaded on demand: only gestorías download them
const MODULE_PAGES: Record<GestoriaModule, Component> = {
  invoices: lazy(async () => import('./modules/invoices/client-invoices.page').then(module => ({ default: module.ClientInvoicesPage }))),
  purchases: lazy(async () => import('./modules/purchases/client-purchases.page').then(module => ({ default: module.ClientPurchasesPage }))),
  taxes: lazy(async () => import('./modules/taxes/client-taxes.page').then(module => ({ default: module.ClientTaxesPage }))),
};

/** A client company opens on its first granted module */
const ClientEntryRedirect: Component = () => {
  const params = useParams();
  const { getClient, isLoading } = useGestoria();

  // Waits for the clients: on a direct load the company is not known yet, it is not a missing one
  return (
    <Show when={!isLoading()}>
      <Show when={getClient(params.organizationId)} fallback={<Navigate href={`/gestoria/${params.gestoriaId}/home`} />}>
        {client => <Navigate href={getGestoriaClientHref({ gestoriaId: params.gestoriaId, client: client() })} />}
      </Show>
    </Show>
  );
};

export const gestoriaRoutes: RouteDefinition = {
  path: '/gestoria/:gestoriaId',
  matchFilters: {
    gestoriaId: GESTORIA_ID_PATTERN,
  },
  component: lazy(async () => import('./layouts/gestoria.layout').then(module => ({ default: module.GestoriaLayout }))),
  children: [
    {
      path: '/',
      component: () => <Navigate href="home" />,
    },
    {
      path: '/home',
      component: lazy(async () => import('./pages/gestoria-home.page').then(module => ({ default: module.GestoriaHomePage }))),
    },
    {
      path: '/clients/:organizationId',
      matchFilters: {
        organizationId: /^org_[a-zA-Z0-9]+$/,
      },
      children: [
        {
          path: '/',
          component: ClientEntryRedirect,
        },
        ...GESTORIA_MODULES.map(module => ({
          path: `/${GESTORIA_MODULE_DEFINITIONS[module].path}`,
          component: MODULE_PAGES[module],
        })),
      ],
    },
    {
      path: '/*404',
      component: NotFoundPage,
    },
  ],
};
