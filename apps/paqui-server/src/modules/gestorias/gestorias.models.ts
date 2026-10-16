import type { GestoriaModule } from './gestorias.types';
import { GESTORIA_MODULES_LIST } from './gestorias.constants';

/** Known modules only, without duplicates, in their canonical order: what is stored for a client */
export function normalizeGestoriaModules({ modules }: { modules: readonly string[] }): GestoriaModule[] {
  return GESTORIA_MODULES_LIST.filter(module => modules.includes(module));
}

/** Whether the access a gestoría has to a client includes the module */
export function hasGestoriaModule({ modules, module }: { modules: readonly string[]; module: GestoriaModule }) {
  return modules.includes(module);
}
