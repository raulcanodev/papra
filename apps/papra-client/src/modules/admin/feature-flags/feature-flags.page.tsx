import type { Component } from 'solid-js';
import type { FeatureFlagEntry } from './feature-flags.services';
import { createMutation, useQuery, useQueryClient } from '@tanstack/solid-query';
import { createSignal, For, Show } from 'solid-js';
import { useConfirmModal } from '@/modules/shared/confirm';
import { Badge } from '@/modules/ui/components/badge';
import { Button } from '@/modules/ui/components/button';
import { Combobox, ComboboxContent, ComboboxInput, ComboboxItem, ComboboxTrigger } from '@/modules/ui/components/combobox';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/modules/ui/components/select';
import { createToast } from '@/modules/ui/components/sonner';
import { listUsers } from '../users/users.services';
import { addFeatureFlagEntry, listFeatureFlagEntries, removeFeatureFlagEntry } from './feature-flags.services';

const knownFlags: { id: string; name: string; description: string }[] = [
  { id: 'llc_finances', name: 'LLC Finances', description: 'Access to the finances module: bank connections, transactions, subscriptions, and financial overview.' },
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
      createToast({ message: 'Entry added', type: 'success' });
      setNewFlagId('');
      setNewEmail('');
      queryClient.invalidateQueries({ queryKey: ['admin', 'feature-flags'] });
    },
    onError: () => {
      createToast({ message: 'Failed to add entry', type: 'error' });
    },
  }));

  const removeMutation = createMutation(() => ({
    mutationFn: (entryId: string) => removeFeatureFlagEntry({ entryId }),
    onSuccess: () => {
      createToast({ message: 'Entry removed', type: 'success' });
      queryClient.invalidateQueries({ queryKey: ['admin', 'feature-flags'] });
    },
    onError: () => {
      createToast({ message: 'Failed to remove entry', type: 'error' });
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
      title: 'Remove feature flag entry',
      message: `Remove access to "${entry.flagId}" for ${entry.userEmail}?`,
      confirmButton: { text: 'Remove', variant: 'destructive' },
    });
    if (ok) {
      removeMutation.mutate(entry.id);
    }
  };

  const grouped = () => groupByFlag(query.data?.entries ?? []);
  const flagIds = () => Object.keys(grouped()).sort();

  return (
    <div class="p-6 max-w-3xl">
      <div class="border-b mb-6 pb-4">
        <h1 class="text-xl font-bold mb-1">Feature Flags</h1>
        <p class="text-sm text-muted-foreground">
          Manage which users have access to specific features. Changes take effect on next page load.
        </p>
      </div>

      {/* Add new entry */}
      <div class="mb-8 border rounded-lg p-4 bg-card">
        <h2 class="text-sm font-semibold mb-3">Add access</h2>
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
              <SelectValue<string>>{state => knownFlags.find(f => f.id === state.selectedOption())?.name ?? 'Select flag...'}</SelectValue>
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
            placeholder="Search users..."
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
            Add
          </Button>
        </div>
      </div>

      {/* Known flags reference */}
      <div class="mb-8">
        <h2 class="text-sm font-semibold mb-3">Available flags</h2>
        <div class="grid gap-3">
          <For each={knownFlags}>
            {flag => (
              <div class="flex items-start gap-3 border rounded-lg px-4 py-3">
                <div class="i-tabler-flag size-4 text-primary mt-0.5 shrink-0" />
                <div class="flex-1 min-w-0">
                  <div class="flex items-center gap-2">
                    <span class="font-mono text-sm font-semibold">{flag.id}</span>
                    <Badge variant="outline" class="text-xs">
                      {grouped()[flag.id]?.length ?? 0}
                      {' '}
                      user
                      {(grouped()[flag.id]?.length ?? 0) === 1 ? '' : 's'}
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
            <p class="text-sm">No feature flag entries yet.</p>
          </div>
        )}
      >
        <h2 class="text-sm font-semibold mb-3">Assigned users</h2>
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
                      {grouped()[flagId]?.length ?? 0}
                      {' '}
                      user
                      {(grouped()[flagId]?.length ?? 0) === 1 ? '' : 's'}
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
