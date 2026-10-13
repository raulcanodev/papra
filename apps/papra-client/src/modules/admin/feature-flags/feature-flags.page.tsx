import type { Component } from 'solid-js';
import type { FeatureFlagEntry } from './feature-flags.services';
import type { TranslationKeys } from '@/modules/i18n/locales.types';
import { createMutation, useQuery, useQueryClient } from '@tanstack/solid-query';
import { createSignal, For, Show } from 'solid-js';
import { useI18n } from '@/modules/i18n/i18n.provider';
import { useConfirmModal } from '@/modules/shared/confirm';
import { Badge } from '@/modules/ui/components/badge';
import { Button } from '@/modules/ui/components/button';
import { Combobox, ComboboxContent, ComboboxInput, ComboboxItem, ComboboxTrigger } from '@/modules/ui/components/combobox';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/modules/ui/components/select';
import { createToast } from '@/modules/ui/components/sonner';
import { listUsers } from '../users/users.services';
import { addFeatureFlagEntry, listFeatureFlagEntries, removeFeatureFlagEntry } from './feature-flags.services';

const knownFlagDefinitions: { id: string; nameKey: TranslationKeys; descriptionKey: TranslationKeys }[] = [
  { id: 'llc_finances', nameKey: 'admin.feature-flags.flag.llc-finances.name', descriptionKey: 'admin.feature-flags.flag.llc-finances.description' },
];

function groupByFlag(entries: FeatureFlagEntry[]): Record<string, FeatureFlagEntry[]> {
  return entries.reduce<Record<string, FeatureFlagEntry[]>>((acc, entry) => {
    if (!acc[entry.flagId]) {
      acc[entry.flagId] = [];
    }
    acc[entry.flagId]!.push(entry);
    return acc;
  }, {});
}

export const AdminFeatureFlagsPage: Component = () => {
  const { t } = useI18n();
  const knownFlags = knownFlagDefinitions.map(flag => ({ id: flag.id, get name() {
    return t(flag.nameKey);
  }, get description() {
    return t(flag.descriptionKey);
  } }));
  const queryClient = useQueryClient();
  const { confirm } = useConfirmModal();
  const [newFlagId, setNewFlagId] = createSignal('');
  const [newEmail, setNewEmail] = createSignal('');
  const [emailSearch, setEmailSearch] = createSignal('');

  const query = useQuery(() => ({
    queryKey: ['admin', 'feature-flags'],
    queryFn: listFeatureFlagEntries,
  }));

  const usersQuery = useQuery(() => ({
    queryKey: ['admin', 'users', 'search', emailSearch()],
    queryFn: () => listUsers({ search: emailSearch() || undefined, pageSize: 50 }),
  }));

  const userEmails = () => usersQuery.data?.users.map(u => u.email) ?? [];

  const addMutation = createMutation(() => ({
    mutationFn: ({ flagId, userEmail }: { flagId: string; userEmail: string }) =>
      addFeatureFlagEntry({ flagId, userEmail }),
    onSuccess: () => {
      createToast({ message: t('admin.feature-flags.toast.added'), type: 'success' });
      setNewFlagId('');
      setNewEmail('');
      queryClient.invalidateQueries({ queryKey: ['admin', 'feature-flags'] });
    },
    onError: () => {
      createToast({ message: t('admin.feature-flags.toast.add-error'), type: 'error' });
    },
  }));

  const removeMutation = createMutation(() => ({
    mutationFn: (entryId: string) => removeFeatureFlagEntry({ entryId }),
    onSuccess: () => {
      createToast({ message: t('admin.feature-flags.toast.removed'), type: 'success' });
      queryClient.invalidateQueries({ queryKey: ['admin', 'feature-flags'] });
    },
    onError: () => {
      createToast({ message: t('admin.feature-flags.toast.remove-error'), type: 'error' });
    },
  }));

  const handleAdd = () => {
    const flagId = newFlagId().trim();
    const userEmail = newEmail().trim();
    if (!flagId || !userEmail) {
      return;
    }
    addMutation.mutate({ flagId, userEmail });
  };

  const handleRemove = async (entry: FeatureFlagEntry) => {
    const ok = await confirm({
      title: t('admin.feature-flags.remove.title'),
      message: t('admin.feature-flags.remove.message', { flag: entry.flagId, email: entry.userEmail }),
      confirmButton: { text: t('admin.feature-flags.remove.confirm'), variant: 'destructive' },
    });
    if (ok) {
      removeMutation.mutate(entry.id);
    }
  };

  const grouped = () => groupByFlag(query.data?.entries ?? []);
  const flagIds = () => Object.keys(grouped()).sort();

  return (
    <div class="page-narrow">
      <div class="page-header">
        <div>
          <h1 class="page-title">{t('admin.feature-flags.title')}</h1>
          <p class="page-description">{t('admin.feature-flags.description')}</p>
        </div>
      </div>

      {/* Add new entry */}
      <div class="mb-8 border rounded-lg p-4 bg-card">
        <h2 class="text-sm font-semibold mb-3">{t('admin.feature-flags.add.title')}</h2>
        <div class="flex flex-col sm:flex-row gap-2">
          <Select
            options={knownFlags.map(f => f.id)}
            value={newFlagId()}
            onChange={value => setNewFlagId(value ?? '')}
            itemComponent={props => (
              <SelectItem item={props.item}>
                {knownFlags.find(f => f.id === props.item.rawValue)?.name ?? props.item.rawValue}
              </SelectItem>
            )}
          >
            <SelectTrigger class="flex-1">
              <SelectValue<string>>{state => knownFlags.find(f => f.id === state.selectedOption())?.name ?? t('admin.feature-flags.add.select-flag')}</SelectValue>
            </SelectTrigger>
            <SelectContent />
          </Select>
          <Combobox<string>
            options={userEmails()}
            value={newEmail()}
            onChange={value => setNewEmail(value ?? '')}
            onInputChange={value => setEmailSearch(value)}
            optionValue={email => email}
            optionTextValue={email => email}
            optionLabel={email => email}
            placeholder={t('admin.feature-flags.add.search-users')}
            itemComponent={props => (
              <ComboboxItem item={props.item}>{props.item.rawValue}</ComboboxItem>
            )}
          >
            <ComboboxTrigger class="flex-1">
              <ComboboxInput />
            </ComboboxTrigger>
            <ComboboxContent />
          </Combobox>
          <Button
            size="sm"
            class="shrink-0 gap-1.5"
            onClick={handleAdd}
            disabled={addMutation.isPending || !newFlagId().trim() || !newEmail().trim()}
          >
            <div class="i-tabler-plus size-4" />
            {t('admin.feature-flags.add.submit')}
          </Button>
        </div>
      </div>

      {/* Known flags reference */}
      <div class="mb-8">
        <h2 class="text-sm font-semibold mb-3">{t('admin.feature-flags.available')}</h2>
        <div class="grid gap-3">
          <For each={knownFlags}>
            {flag => (
              <div class="flex items-start gap-3 border rounded-lg px-4 py-3">
                <div class="i-tabler-flag size-4 text-primary mt-0.5 shrink-0" />
                <div class="flex-1 min-w-0">
                  <div class="flex items-center gap-2">
                    <span class="font-mono text-sm font-semibold">{flag.id}</span>
                    <Badge variant="outline" class="text-xs">
                      {t('admin.feature-flags.users-count', { count: grouped()[flag.id]?.length ?? 0 })}
                    </Badge>
                  </div>
                  <p class="text-xs text-muted-foreground mt-0.5">{flag.description}</p>
                </div>
              </div>
            )}
          </For>
        </div>
      </div>

      {/* Entries grouped by flag */}
      <Show
        when={flagIds().length > 0}
        fallback={(
          <div class="text-center py-16 text-muted-foreground">
            <div class="i-tabler-flag size-12 mx-auto opacity-30 mb-4" />
            <p class="text-sm">{t('admin.feature-flags.empty')}</p>
          </div>
        )}
      >
        <h2 class="text-sm font-semibold mb-3">{t('admin.feature-flags.assigned')}</h2>
        <div class="flex flex-col gap-6">
          <For each={flagIds()}>
            {flagId => (
              <div class="border rounded-lg overflow-hidden">
                <div class="px-4 py-2.5 bg-muted/50 border-b">
                  <div class="flex items-center gap-2">
                    <div class="i-tabler-flag size-4 text-primary" />
                    <span class="font-mono text-sm font-semibold">{flagId}</span>
                    <Show when={knownFlags.find(f => f.id === flagId)}>
                      <span class="text-xs text-muted-foreground">
                        {'— '}
                        {knownFlags.find(f => f.id === flagId)!.name}
                      </span>
                    </Show>
                    <Badge variant="outline" class="text-xs ml-auto">
                      {t('admin.feature-flags.users-count', { count: grouped()[flagId]?.length ?? 0 })}
                    </Badge>
                  </div>
                </div>
                <div class="divide-y divide-border">
                  <For each={grouped()[flagId]}>
                    {entry => (
                      <div class="flex items-center gap-3 px-4 py-2.5">
                        <div class="i-tabler-user size-4 text-muted-foreground shrink-0" />
                        <span class="text-sm flex-1">{entry.userEmail}</span>
                        <Button
                          variant="ghost"
                          size="icon"
                          class="size-7 text-destructive hover:text-destructive"
                          onClick={() => handleRemove(entry)}
                          aria-label={t('admin.feature-flags.remove')}
                          disabled={removeMutation.isPending}
                        >
                          <div class="i-tabler-trash size-3.5" />
                        </Button>
                      </div>
                    )}
                  </For>
                </div>
              </div>
            )}
          </For>
        </div>
      </Show>
    </div>
  );
};
