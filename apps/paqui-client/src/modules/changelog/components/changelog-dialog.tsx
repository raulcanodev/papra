import type { Component } from 'solid-js';
import { createMutation } from '@tanstack/solid-query';
import { createSignal, For, Show } from 'solid-js';
import { useSession } from '@/modules/auth/composables/use-session.composable';
import { useI18n } from '@/modules/i18n/i18n.provider';
import { queryClient } from '@/modules/shared/query/query-client';
import { Button } from '@/modules/ui/components/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/modules/ui/components/dialog';
import { useCurrentUser } from '@/modules/users/composables/useCurrentUser';
import { markChangelogSeen } from '@/modules/users/users.services';
import changelog from '../changelog.md?raw';
import { getMessageParts, getUnseenChangelog, parseChangelog } from '../changelog.models';

const entries = parseChangelog(changelog);

// What is new since the last visit, told by Paqui once. An admin acting as the user does not get it: it is theirs to read
export const ChangelogDialog: Component = () => {
  const { t } = useI18n();
  const { user } = useCurrentUser();
  const { getUser, getImpersonation } = useSession();
  const [isDismissed, setIsDismissed] = createSignal(false);

  const unseen = () => getUnseenChangelog({ entries, lastSeenId: user.lastSeenChangelogId, userCreatedAt: user.createdAt });
  const isOpen = () => !isDismissed() && unseen().messages.length > 0 && getUser() !== undefined && getImpersonation() === undefined;

  const seenMutation = createMutation(() => ({
    mutationFn: markChangelogSeen,
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['users', 'me'] }),
  }));

  const dismiss = () => {
    const entryId = unseen().latestId;
    setIsDismissed(true);

    if (entryId !== undefined) {
      seenMutation.mutate({ entryId });
    }
  };

  return (
    <Dialog open={isOpen()} onOpenChange={open => !open && dismiss()}>
      <DialogContent class="max-w-md">
        <DialogHeader>
          <DialogTitle>{t('changelog.title')}</DialogTitle>
        </DialogHeader>
        <ul class="max-h-[60dvh] space-y-3 overflow-y-auto">
          <For each={unseen().messages}>
            {message => (
              <li class="flex items-start gap-2.5">
                <img src="/logo.svg" alt="" class="size-7 shrink-0 [image-rendering:pixelated]" />
                <p class="min-w-0 rounded-2xl rounded-tl-sm bg-muted px-3 py-2 text-sm">
                  <For each={getMessageParts(message)}>
                    {part => <Show when={part.isBold} fallback={part.text}><strong class="font-semibold">{part.text}</strong></Show>}
                  </For>
                </p>
              </li>
            )}
          </For>
        </ul>
        <Button class="w-full" onClick={dismiss}>{t('changelog.close')}</Button>
      </DialogContent>
    </Dialog>
  );
};
