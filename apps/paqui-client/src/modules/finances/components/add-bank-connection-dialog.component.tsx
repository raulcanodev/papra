import type { Component } from 'solid-js';
import type { ProviderAccount } from '../finances.types';
import { createMutation, useQueryClient } from '@tanstack/solid-query';
import { createSignal, For, Show } from 'solid-js';
import { useI18n } from '@/modules/i18n/i18n.provider';
import { Button } from '@/modules/ui/components/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/modules/ui/components/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/modules/ui/components/select';
import { createToast } from '@/modules/ui/components/sonner';
import { TextField, TextFieldRoot } from '@/modules/ui/components/textfield';
import { createBankConnection, fetchBankProviderAccounts } from '../finances.services';

const providers = [
  { value: 'mercury', label: 'Mercury' },
  { value: 'wise', label: 'Wise' },
];

export const AddBankConnectionDialog: Component<{ organizationId: string }> = (props) => {
  const { t } = useI18n();
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
      createToast({ message: t('finances.bank-connection.toast.fetch-error'), type: 'error' });
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
      createToast({ message: t('finances.bank-connection.toast.connected'), type: 'success' });
      queryClient.invalidateQueries({ queryKey: ['organizations', props.organizationId, 'finances'] });
      setIsOpen(false);
      resetForm();
    },
    onError: () => {
      createToast({ message: t('finances.bank-connection.toast.connect-error'), type: 'error' });
    },
  }));

  return (
    <Dialog
      open={isOpen()}
      onOpenChange={(open) => {
        setIsOpen(open);
        if (!open) {
          resetForm();
        }
      }}
    >
      <DialogTrigger as={Button}>
        <div class="i-tabler-plus size-4 mr-1" />
        {t('finances.bank-connection.connect')}
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{step() === 1 ? t('finances.bank-connection.connect.title') : t('finances.bank-connection.select.title')}</DialogTitle>
        </DialogHeader>

        <Show when={step() === 1}>
          <div class="flex flex-col gap-4 mt-4">
            <div>
              <label class="text-sm font-medium mb-1.5 block">{t('finances.bank-connection.provider')}</label>
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
              <label class="text-sm font-medium mb-1.5 block">{t('finances.bank-connection.account-name')}</label>
              <TextFieldRoot>
                <TextField
                  placeholder={t('finances.bank-connection.account-name.placeholder')}
                  value={name()}
                  onInput={e => setName(e.currentTarget.value)}
                />
              </TextFieldRoot>
            </div>

            <div>
              <label class="text-sm font-medium mb-1.5 block">{t('finances.bank-connection.api-key')}</label>
              <TextFieldRoot>
                <TextField
                  type="password"
                  placeholder={t('finances.bank-connection.api-key.placeholder')}
                  value={apiKey()}
                  onInput={e => setApiKey(e.currentTarget.value)}
                />
              </TextFieldRoot>
              <Show when={provider() === 'wise'}>
                <p class="text-xs text-muted-foreground mt-1.5">
                  {t('finances.bank-connection.api-key.help')}
                  <a
                    href="https://wise.com/your-account/integrations-and-tools/api-tokens"
                    target="_blank"
                    rel="noopener noreferrer"
                    class="text-primary underline underline-offset-2 hover:opacity-80"
                  >
                    Wise → Integrations & Tools → API tokens
                  </a>
                </p>
              </Show>
              <Show when={provider() === 'mercury'}>
                <p class="text-xs text-muted-foreground mt-1.5">
                  {t('finances.bank-connection.api-key.help')}
                  <a
                    href="https://app.mercury.com/settings/tokens"
                    target="_blank"
                    rel="noopener noreferrer"
                    class="text-primary underline underline-offset-2 hover:opacity-80"
                  >
                    Mercury → Settings → API tokens
                  </a>
                </p>
              </Show>
            </div>

            <Button
              onClick={() => fetchAccountsMutation.mutate()}
              disabled={fetchAccountsMutation.isPending || !name() || !apiKey()}
              class="mt-2"
            >
              {fetchAccountsMutation.isPending ? t('finances.bank-connection.fetching') : t('finances.bank-connection.next')}
            </Button>
          </div>
        </Show>

        <Show when={step() === 2}>
          <div class="flex flex-col gap-4 mt-4">
            <Show when={accounts().length > 0}>
              <p class="text-sm text-muted-foreground">{t('finances.bank-connection.select.description')}</p>
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
              <p class="text-sm text-muted-foreground">{t('finances.bank-connection.select.empty')}</p>
            </Show>

            <div class="flex gap-2 mt-2">
              <Button
                variant="outline"
                class="flex-1"
                onClick={() => setStep(1)}
                disabled={createMut.isPending}
              >
                {t('finances.bank-connection.back')}
              </Button>
              <Button
                class="flex-1"
                onClick={() => createMut.mutate()}
                disabled={createMut.isPending}
              >
                {createMut.isPending ? t('finances.bank-connection.connecting') : accountId() ? t('finances.bank-connection.connect-account') : t('finances.bank-connection.connect-auto')}
              </Button>
            </div>
          </div>
        </Show>
      </DialogContent>
    </Dialog>
  );
};
