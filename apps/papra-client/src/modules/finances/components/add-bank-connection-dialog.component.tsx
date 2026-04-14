import type { Component } from 'solid-js';
import { createMutation, useQueryClient } from '@tanstack/solid-query';
import { createSignal, Show } from 'solid-js';
import { Button } from '@/modules/ui/components/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/modules/ui/components/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/modules/ui/components/select';
import { TextField, TextFieldRoot } from '@/modules/ui/components/textfield';
import { createToast } from '@/modules/ui/components/sonner';
import { createBankConnection } from '../finances.services';

const providers = [
  { value: 'mercury', label: 'Mercury' },
  { value: 'wise', label: 'Wise' },
];

export const AddBankConnectionDialog: Component<{ organizationId: string }> = (props) => {
  const queryClient = useQueryClient();
  const [isOpen, setIsOpen] = createSignal(false);
  const [provider, setProvider] = createSignal<string>('mercury');
  const [name, setName] = createSignal('');
  const [apiKey, setApiKey] = createSignal('');
  const [accountId, setAccountId] = createSignal('');

  const mutation = createMutation(() => ({
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
      setName('');
      setApiKey('');
      setAccountId('');
    },
    onError: () => {
      createToast({ message: 'Failed to connect bank account. Check your API key.', type: 'error' });
    },
  }));

  return (
    <Dialog open={isOpen()} onOpenChange={setIsOpen}>
      <DialogTrigger as={Button}>
        <div class="i-tabler-plus size-4 mr-1" />
        Connect Bank
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Connect Bank Account</DialogTitle>
        </DialogHeader>

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

          <Show when={provider() === 'mercury'}>
            <div>
              <label class="text-sm font-medium mb-1.5 block">
                Account ID
                {' '}
                <span class="text-muted-foreground">(optional)</span>
              </label>
              <TextFieldRoot>
                <TextField
                  placeholder="Mercury account ID"
                  value={accountId()}
                  onInput={e => setAccountId(e.currentTarget.value)}
                />
              </TextFieldRoot>
            </div>
          </Show>

          <Show when={provider() === 'wise'}>
            <div>
              <label class="text-sm font-medium mb-1.5 block">
                Profile:Balance ID
                {' '}
                <span class="text-muted-foreground">(optional, format: profileId:balanceId)</span>
              </label>
              <TextFieldRoot>
                <TextField
                  placeholder="e.g. 12345:67890"
                  value={accountId()}
                  onInput={e => setAccountId(e.currentTarget.value)}
                />
              </TextFieldRoot>
            </div>
          </Show>

          <Button
            onClick={() => mutation.mutate()}
            disabled={mutation.isPending || !name() || !apiKey()}
            class="mt-2"
          >
            {mutation.isPending ? 'Connecting...' : 'Connect Account'}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
};
