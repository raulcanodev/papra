import type { Component } from 'solid-js';
import { createMutation, useQuery, useQueryClient } from '@tanstack/solid-query';
import { createSignal, For, Show } from 'solid-js';
import { useConfirmModal } from '@/modules/shared/confirm';
import { Badge } from '@/modules/ui/components/badge';
import { Button } from '@/modules/ui/components/button';
import { createToast } from '@/modules/ui/components/sonner';
import { TextField, TextFieldRoot } from '@/modules/ui/components/textfield';
import { addFeatureFlagEntry, listFeatureFlagEntries, removeFeatureFlagEntry } from './feature-flags.services';
import type { FeatureFlagEntry } from './feature-flags.services';

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

  const query = useQuery(() => ({
    queryKey: ['admin', 'feature-flags'],
    queryFn: listFeatureFlagEntries,
  }));

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
          <TextFieldRoot class="flex-1">
            <TextField
              placeholder="Flag ID (e.g. llc_finances)"
              value={newFlagId()}
              onInput={e => setNewFlagId(e.currentTarget.value)}
            />
          </TextFieldRoot>
          <TextFieldRoot class="flex-1">
            <TextField
              type="email"
              placeholder="user@example.com"
              value={newEmail()}
              onInput={e => setNewEmail(e.currentTarget.value)}
            />
          </TextFieldRoot>
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
        <div class="flex flex-col gap-6">
          <For each={flagIds()}>
            {flagId => (
              <div class="border rounded-lg overflow-hidden">
                <div class="px-4 py-2.5 bg-muted/50 flex items-center gap-2 border-b">
                  <div class="i-tabler-flag size-4 text-primary" />
                  <span class="font-mono text-sm font-semibold">{flagId}</span>
                  <Badge variant="outline" class="text-xs ml-auto">
                    {grouped()[flagId]?.length ?? 0}
                    {' '}
                    user
                    {(grouped()[flagId]?.length ?? 0) === 1 ? '' : 's'}
                  </Badge>
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
