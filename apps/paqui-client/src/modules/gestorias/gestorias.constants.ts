import type { GestoriaModule } from './gestorias.types';
import type { TranslationKeys } from '@/modules/i18n/locales.types';

type GestoriaModuleDefinition = {
  /** Path of the module page, under the client company */
  path: string;
  icon: string;
  labelKey: TranslationKeys;
};

// The pages of a client company, in menu order. A new module is a new entry here and its page in ./modules/<module>
export const GESTORIA_MODULE_DEFINITIONS = {
  invoices: { path: 'invoices', icon: 'i-tabler-receipt', labelKey: 'gestorias.modules.invoices' },
  purchases: { path: 'invoices/received', icon: 'i-tabler-file-invoice', labelKey: 'gestorias.modules.purchases' },
  taxes: { path: 'taxes', icon: 'i-tabler-receipt-tax', labelKey: 'gestorias.modules.taxes' },
} as const satisfies Record<GestoriaModule, GestoriaModuleDefinition>;

export const GESTORIA_MODULES = Object.keys(GESTORIA_MODULE_DEFINITIONS) as GestoriaModule[];

export const GESTORIA_ID_PATTERN = /^gst_[a-z0-9]+$/;
