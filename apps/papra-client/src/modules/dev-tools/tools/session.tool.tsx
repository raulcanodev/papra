import type { Component } from 'solid-js';
import { useLocation } from '@solidjs/router';
import { createSignal, Show } from 'solid-js';
import { signOut } from '@/modules/auth/auth.services';
import { useSession } from '@/modules/auth/composables/use-session.composable';
import { queryClient } from '@/modules/shared/query/query-client';
import { Button } from '@/modules/ui/components/button';
import { getOrganizationIdFromPath } from './onboarding.tool';

const CopyRow: Component<{ label: string; value: string }> = (props) => {
  const [copied, setCopied] = createSignal(false);

  return (
    <button
      type="button"
      title="Copy"
      class="flex w-full min-w-0 items-center gap-2 rounded-md px-1.5 py-1 text-left text-xs hover:bg-accent"
      onClick={async () => {
        await navigator.clipboard.writeText(props.value);
        setCopied(true);
        setTimeout(() => setCopied(false), 1200);
      }}
    >
      <span class="w-10 shrink-0 text-muted-foreground">{props.label}</span>
      <span class="min-w-0 flex-1 truncate font-mono">{props.value}</span>
      <div class={copied() ? 'i-tabler-check size-3.5 text-primary' : 'i-tabler-copy size-3.5 text-muted-foreground'} />
    </button>
  );
};

/** Who is signed in, and quick resets for the client state. */
export const SessionTool: Component = () => {
  const { getUser } = useSession();
  const location = useLocation();
  const organizationId = () => getOrganizationIdFromPath(location.pathname);

  return (
    <div class="grid gap-2">
      <Show when={getUser()} fallback={<p class="text-xs text-muted-foreground">Signed out.</p>}>
        {user => (
          <div class="grid">
            <CopyRow label="Email" value={user().email} />
            <CopyRow label="User" value={user().id} />
            <Show when={organizationId()}>{id => <CopyRow label="Org" value={id()} />}</Show>
          </div>
        )}
      </Show>
      <div class="grid grid-cols-3 gap-2">
        <Button size="sm" variant="outline" class="min-w-0 px-2" title="Refetch every query" onClick={() => queryClient.invalidateQueries()}>Refetch</Button>
        <Button
          size="sm"
          variant="outline"
          class="min-w-0 px-2"
          title="Clear localStorage and reload"
          onClick={() => {
            localStorage.clear();
            window.location.reload();
          }}
        >
          Storage
        </Button>
        <Show when={getUser()}>
          <Button
            size="sm"
            variant="outline"
            class="min-w-0 px-2"
            onClick={async () => {
              await signOut();
              window.location.href = '/login';
            }}
          >
            Sign out
          </Button>
        </Show>
      </div>
    </div>
  );
};
