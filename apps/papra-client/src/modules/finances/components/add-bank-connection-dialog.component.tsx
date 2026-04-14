import type { Component } from 'solid-js';
import { createMutation, useQueryClient } from '@tanstack/solid-query';
import { createSignal, For, Show } from 'solid-js';
import { Button } from '@/modules/ui/components/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/modules/ui/components/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/modules/ui/components/select';
import { TextField, TextFieldRoot } from '@/modules/ui/components/textfield';
import { createToast } from '@/modules/ui/components/sonner';
import { createBankConnection, fetchBankProviderAccounts } from '../finances.services';
import type { ProviderAccount } from '../finances.types';

const providers = [
  { value: 'mercury', label: 'Mercury' },
  { value: 'wise', label: 'Wise' },
];

export const AddBankConnectionDialog: Component<{ organizationId: string }> = (props) => {
  const queryClient = useQueryClient();
  const [isOpen, setIsOpen] = createSignal(false);
  const [step, setStep] = createSignal<1 | 2>(1);
  const [provider, setProvider] = createSignal<string>('mercury');
  const [name, setName] = createSignal('');
  const [apiKey, setApiKey] = createSignal('');
  const [accountId, setAccountId] = createSignal('');
  const [accounts, setAccounts] = createSignal<ProviderAccount[]>([]);

  function resetForm() {
    setStep(1);
    setName('');
    setApiKey('');
    setAccountId('');
    setAccounts([]);
  }

  const fetchAccountsMutation = createMutation(() => ({
    mutationFn: () => fetchBankProviderAccounts({
      organizationId: props.organizationId,
      provider: provider(),
      apiKey: apiKey(),
    }),
    onSuccess: (data) => {
      setAccounts(data.accounts);
      setStep(2);
    },
    onError: () => {
      createToast({ message: 'Failed to fetch accounts. Check your API key.', type: 'error' });
    },
  }));

  const createMut = createMutation(() => ({
    mutationFn: () => createBankConnection({
      organizationId: props.organizationId,
      provider: provider(),
      name: name(),
      apiKey: apiKey(),
      accountId: accountId() || undefined,
    }),
    onSuccess: () => {
      createToast({ message: 'Bank account connected', type: 'success' });
      queryClient.invalidateQueries({ queryKey: ['organizations', props.organizationId, 'finances'] });
      setIsOpen(false);
      resetForm();
    },
    onError: () => {
      createToast({ message: 'Failed to connect bank account.', type: 'error' });
    },
  }));

  return (
    <Dialog open={isOpen()} onOpenChange={(open) => { setIsOpen(open); if (!open) resetForm(); }}>
      <DialogTrigger as={Button}>
        <div class="i-tabler-plus size-4 mr-1" />
        Connect Bank
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{step() === 1 ? 'Connect Bank Account' : 'Select Account'}</DialogTitle>
        </DialogHeader>

        <Show when={step() === 1}>
          <div class="flex flex-col gap-4 mt-4">
            <div>
              <label class="text-sm font-medium mb-1.5 block">Provider</label>
              <Select
                options={providers}
                optionValue="value"
                optionTextValue="label"
                value={providers.find(p => p.value === provider())}
                onChange={v => v && setProvider(v.value)}
                itemComponent={prps => <SelectItem item={prps.item}>{prps.item.rawValue.label}</SelectItem>}
              >
                <SelectTrigger>
                  <SelectValue<typeof providers[0]>>{state => state.selectedOption()?.label}</SelectValue>
                </SelectTrigger>
                <SelectContent />
              </Select>
            </div>

            <div>
              <label class="text-sm font-medium mb-1.5 block">Account Name</label>
              <TextFieldRoot>
                <TextField
                  placeholder="e.g. Mercury LLC Checking"
                  value={name()}
                  onInput={e => setName(e.currentTarget.value)}
                />
              </TextFieldRoot>
            </div>

            <div>
              <label class="text-sm font-medium mb-1.5 block">API Key</label>
              <TextFieldRoot>
                <TextField
                  type="password"
                  placeholder="Paste your API key"
                  value={apiKey()}
                  onInput={e => setApiKey(e.currentTarget.value)}
                />
              </TextFieldRoot>
            </div>

            <Button
              onClick={() => fetchAccountsMutation.mutate()}
              disabled={fetchAccountsMutation.isPending || !name() || !apiKey()}
              class="mt-2"
            >
              {fetchAccountsMutation.isPending ? 'Fetching accounts...' : 'Next — Select Account'}
            </Button>
          </div>
        </Show>

        <Show when={step() === 2}>
          <div class="flex flex-col gap-4 mt-4">
            <Show when={accounts().length > 0}>
              <p class="text-sm text-muted-foreground">Select the account to track, or skip to auto-detect.</p>
              <div class="flex flex-col gap-2 max-h-60 overflow-y-auto">
                <For each={accounts()}>
                  {account => (
                    <button
                      type="button"
                      class={`flex items-center gap-3 p-3 border rounded-lg text-left transition-colors hover:bg-muted/50 ${accountId() === account.id ? 'border-primary bg-primary/5' : ''}`}
                      onClick={() => setAccountId(prev => prev === account.id ? '' : account.id)}
                    >
                      <div class="i-tabler-wallet size-5 text-muted-foreground shrink-0" />
                      <div class="flex-1 min-w-0">
                        <div class="font-medium text-sm truncate">{account.name}</div>
                        <div class="text-xs text-muted-foreground font-mono">{account.id}</div>
                      </div>
                      <Show when={accountId() === account.id}>
                        <div class="i-tabler-check size-4 text-primary shrink-0" />
                      </Show>
                    </button>
                  )}
                </For>
              </div>
            </Show>

            <Show when={accounts().length === 0}>
              <p class="text-sm text-muted-foreground">No accounts found. The first available account will be used automatically.</p>
            </Show>

            <div class="flex gap-2 mt-2">
              <Button
                variant="outline"
                class="flex-1"
                onClick={() => setStep(1)}
                disabled={createMut.isPending}
              >
                Back
              </Button>
              <Button
                class="flex-1"
                onClick={() => createMut.mutate()}
                disabled={createMut.isPending}
              >
                {createMut.isPending ? 'Connecting...' : accountId() ? 'Connect Account' : 'Connect (Auto-detect)'}
              </Button>
            </div>
          </div>
        </Show>
      </DialogContent>
    </Dialog>
  );
};
