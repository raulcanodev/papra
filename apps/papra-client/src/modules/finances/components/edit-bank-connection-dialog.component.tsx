import type { Component } from 'solid-js';
import { createMutation, useQueryClient } from '@tanstack/solid-query';
import { createEffect, createSignal } from 'solid-js';
import { Button } from '@/modules/ui/components/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/modules/ui/components/dialog';
import { createToast } from '@/modules/ui/components/sonner';
import { TextField, TextFieldRoot } from '@/modules/ui/components/textfield';
import { updateBankConnection } from '../finances.services';

export const EditBankConnectionDialog: Component<{
  organizationId: string;
  bankConnectionId: string;
  initialName: string;
  initialAccountId?: string | null;
  provider: string;
  isOpen: boolean;
  onClose: () => void;
}> = (props) => {
  const queryClient = useQueryClient();
  const [name, setName] = createSignal(props.initialName);
  const [accountId, setAccountId] = createSignal(props.initialAccountId ?? '');
  const [apiKey, setApiKey] = createSignal('');

  createEffect(() => {
    if (props.isOpen) {
      setName(props.initialName);
      setAccountId(props.initialAccountId ?? '');
      setApiKey('');
    }
  });

  const mutation = createMutation(() => ({
    mutationFn: () => updateBankConnection({
      organizationId: props.organizationId,
      bankConnectionId: props.bankConnectionId,
      name: name() || undefined,
      accountId: accountId() || null,
      apiKey: apiKey() || undefined,
    }),
    onSuccess: () => {
      createToast({ message: 'Bank account updated', type: 'success' });
      queryClient.invalidateQueries({ queryKey: ['organizations', props.organizationId, 'finances'] });
      props.onClose();
    },
    onError: () => {
      createToast({ message: 'Failed to update bank account', type: 'error' });
    },
  }));

  const accountIdLabel = () => props.provider === 'wise' ? 'Profile:Balance ID' : 'Account ID';
  const accountIdPlaceholder = () => props.provider === 'wise' ? 'e.g. 12345:67890' : 'Account ID (optional)';

  return (
    <Dialog open={props.isOpen} onOpenChange={open => !open && props.onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Edit Bank Connection</DialogTitle>
        </DialogHeader>

        <div class="flex flex-col gap-4 mt-4">
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
            <label class="text-sm font-medium mb-1.5 block">
              {accountIdLabel()}
              {' '}
              <span class="text-muted-foreground">(optional)</span>
            </label>
            <TextFieldRoot>
              <TextField
                placeholder={accountIdPlaceholder()}
                value={accountId()}
                onInput={e => setAccountId(e.currentTarget.value)}
              />
            </TextFieldRoot>
          </div>

          <div>
            <label class="text-sm font-medium mb-1.5 block">
              New API Key
              {' '}
              <span class="text-muted-foreground">(leave empty to keep current)</span>
            </label>
            <TextFieldRoot>
              <TextField
                type="password"
                placeholder="Paste new API key to replace"
                value={apiKey()}
                onInput={e => setApiKey(e.currentTarget.value)}
              />
            </TextFieldRoot>
          </div>

          <div class="flex gap-2 mt-2">
            <Button
              variant="outline"
              class="flex-1"
              onClick={props.onClose}
              disabled={mutation.isPending}
            >
              Cancel
            </Button>
            <Button
              class="flex-1"
              onClick={() => mutation.mutate()}
              disabled={mutation.isPending || !name()}
            >
              {mutation.isPending ? 'Saving...' : 'Save Changes'}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
};
