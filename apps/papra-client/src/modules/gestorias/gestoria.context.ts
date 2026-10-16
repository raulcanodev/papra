import type { Accessor } from 'solid-js';
import type { GestoriaClient, GestoriaSummary } from './gestorias.types';
import { createContext, useContext } from 'solid-js';

type GestoriaContextValue = {
  getGestoria: Accessor<GestoriaSummary | undefined>;
  getClients: Accessor<GestoriaClient[]>;
  getClient: (organizationId: string | undefined) => GestoriaClient | undefined;
  isLoading: Accessor<boolean>;
};

/** The gestoría being browsed and its client companies, loaded once by the layout for every page */
export const GestoriaContext = createContext<GestoriaContextValue>();

export function useGestoria() {
  const context = useContext(GestoriaContext);

  if (!context) {
    throw new Error('useGestoria must be used within a GestoriaProvider');
  }

  return context;
}
