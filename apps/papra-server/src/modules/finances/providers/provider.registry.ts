import type { BankProvider } from '../finances.constants';
import type { BankProviderAdapter } from './provider.types';
import { createMercuryAdapter } from './mercury.adapter';
import { createWiseAdapter } from './wise.adapter';

const adapters: Record<BankProvider, () => BankProviderAdapter> = {
  mercury: createMercuryAdapter,
  wise: createWiseAdapter,
};

export function getBankProviderAdapter({ provider }: { provider: BankProvider }): BankProviderAdapter {
  return adapters[provider]();
}
