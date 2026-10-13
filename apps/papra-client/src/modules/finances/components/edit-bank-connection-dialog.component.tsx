import type { Component } from 'solid-js';
import { createMutation, useQueryClient } from '@tanstack/solid-query';
import { createEffect, createSignal } from 'solid-js';
import { useI18n } from '@/modules/i18n/i18n.provider';
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
  const { t } = useI18n();
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
      createToast({ message: t('finances.bank-connection.toast.updated'), type: 'success' });
      queryClient.invalidateQueries({ queryKey: ['organizations', props.organizationId, 'finances'] });
      props.onClose();
    },
    onError: () => {
      createToast({ message: t('finances.bank-connection.toast.update-error'), type: 'error' });
    },
  }));

  const accountIdLabel = () => props.provider === 'wise' ? t('finances.bank-connection.wise-account-id') : t('finances.bank-connection.account-id');
  const accountIdPlaceholder = () => props.provider === 'wise' ? t('finances.bank-connection.wise-account-id.placeholder') : t('finances.bank-connection.account-id.placeholder');

  return (
    <Dialog open={props.isOpen} onOpenChange={open => !open && props.onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{t('finances.bank-connection.edit')}</DialogTitle>
        </DialogHeader>

        <div class="flex flex-col gap-4 mt-4">
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
            <label class="text-sm font-medium mb-1.5 block">
              {accountIdLabel()}
              {' '}
              <span class="text-muted-foreground">{t('finances.bank-connection.optional')}</span>
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
              {t('finances.bank-connection.new-api-key')}
              {' '}
              <span class="text-muted-foreground">{t('finances.bank-connection.new-api-key.help')}</span>
            </label>
            <TextFieldRoot>
              <TextField
                type="password"
                placeholder={t('finances.bank-connection.new-api-key.placeholder')}
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
              {t('finances.common.cancel')}
            </Button>
            <Button
              class="flex-1"
              onClick={() => mutation.mutate()}
              disabled={mutation.isPending || !name()}
            >
              {mutation.isPending ? t('finances.common.saving') : t('finances.common.save-changes')}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
};
