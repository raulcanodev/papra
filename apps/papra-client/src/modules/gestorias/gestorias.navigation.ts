import type { GestoriaClient, GestoriaModule } from './gestorias.types';
import { GESTORIA_MODULE_DEFINITIONS, GESTORIA_MODULES } from './gestorias.constants';

export function getGestoriaHomeHref({ gestoriaId }: { gestoriaId: string }) {
  return `/gestoria/${gestoriaId}/home`;
}

export function getGestoriaClientModuleHref({ gestoriaId, organizationId, module }: { gestoriaId: string; organizationId: string; module: GestoriaModule }) {
  return `/gestoria/${gestoriaId}/clients/${organizationId}/${GESTORIA_MODULE_DEFINITIONS[module].path}`;
}

/** The granted modules of a client, in menu order */
export function getClientModules({ client }: { client: Pick<GestoriaClient, 'modules'> }) {
  return GESTORIA_MODULES.filter(module => client.modules.includes(module));
}

/** Where a client company opens: its first granted module, or the home when none was granted */
export function getGestoriaClientHref({ gestoriaId, client }: { gestoriaId: string; client: Pick<GestoriaClient, 'organizationId' | 'modules'> }) {
  const [module] = getClientModules({ client });

  return module ? getGestoriaClientModuleHref({ gestoriaId, organizationId: client.organizationId, module }) : getGestoriaHomeHref({ gestoriaId });
}

/** The module whose page is open, from the path under the client company */
export function getModuleFromPathname({ pathname }: { pathname: string }): GestoriaModule | undefined {
  const modulePath = pathname.replace(/^\/gestoria\/[^/]+\/clients\/[^/]+\/?/, '');

  // Longest path first: "invoices/received" is the purchases page, not the invoices one
  return GESTORIA_MODULES
    .toSorted((a, b) => GESTORIA_MODULE_DEFINITIONS[b].path.length - GESTORIA_MODULE_DEFINITIONS[a].path.length)
    .find(module => modulePath === GESTORIA_MODULE_DEFINITIONS[module].path || modulePath.startsWith(`${GESTORIA_MODULE_DEFINITIONS[module].path}/`));
}
