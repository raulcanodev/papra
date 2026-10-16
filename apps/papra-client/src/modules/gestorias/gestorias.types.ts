import type { Quarter } from '@/modules/taxes/taxes.types';

// What a gestoría can read of a client company, granted one by one by an admin (same list as the server)
export type GestoriaModule = 'invoices' | 'purchases' | 'taxes';

export type GestoriaSummary = {
  id: string;
  name: string;
  taxId: string | null;
};

export type GestoriaClient = {
  organizationId: string;
  name: string;
  legalName: string | null;
  taxId: string | null;
  legalForm: string | null;
  modules: GestoriaModule[];
};

export type GestoriaClientBooksActivity = {
  count: number;
  baseMinor: number;
  taxMinor: number;
  lastUpdatedAt: Date | null;
};

export type GestoriaClientActivity = {
  organizationId: string;
  // Null when the module was not granted on this company
  issued: GestoriaClientBooksActivity | null;
  received: GestoriaClientBooksActivity | null;
};

export type GestoriaActivity = {
  period: { year: number; quarter: Quarter; start: Date; end: Date };
  activity: GestoriaClientActivity[];
};
