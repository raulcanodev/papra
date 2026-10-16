import type { GestoriaClient } from '../gestorias.types';
import { useNavigate } from '@solidjs/router';
import { createSignal, For, Show } from 'solid-js';
import { useI18n } from '@/modules/i18n/i18n.provider';
import { cn } from '@/modules/shared/style/cn';
import { Command, CommandEmpty, CommandInput, CommandItem, CommandList } from '@/modules/ui/components/command';
import { DiceBearAvatar } from '@/modules/ui/components/dicebear-avatar';
import { Popover, PopoverContent, PopoverTrigger } from '@/modules/ui/components/popover';
import { getGestoriaClientHref } from '../gestorias.navigation';

/**
 * The company being looked at, switched from a searchable list: a gestoría can keep the books of dozens of
 * companies, a plain select would not scale. Searches by trade name, legal name and tax id.
 */
export function ClientSwitcher(props: { gestoriaId: string; clients: GestoriaClient[]; currentClient?: GestoriaClient }) {
  const { t } = useI18n();
  const navigate = useNavigate();
  const [isOpen, setIsOpen] = createSignal(false);

  return (
    <Popover open={isOpen()} onOpenChange={setIsOpen} placement="bottom-start" sameWidth>
      <PopoverTrigger
        class={cn(
          'flex h-10 w-full items-center gap-2 rounded-md border border-sidebar-border bg-background px-2 text-left text-sm shadow-xs transition-colors hover:bg-sidebar-accent',
          !props.currentClient && 'text-muted-foreground',
        )}
        aria-label={t('gestorias.client-switcher.label')}
      >
        <Show
          when={props.currentClient}
          fallback={(
            <>
              <div class="i-tabler-building-store size-4 shrink-0" />
              <span class="flex-1 truncate">{t('gestorias.client-switcher.placeholder')}</span>
            </>
          )}
        >
          {client => (
            <>
              <DiceBearAvatar seed={client().organizationId} type="organization" alt="" class="size-6 shrink-0 rounded-sm border" />
              <span class="min-w-0 flex-1">
                <span class="block truncate font-medium leading-tight">{client().name}</span>
                <Show when={client().taxId}>
                  <span class="block truncate text-xs text-muted-foreground leading-tight">{client().taxId}</span>
                </Show>
              </span>
            </>
          )}
        </Show>
        <div class="i-tabler-selector size-4 shrink-0 text-muted-foreground" />
      </PopoverTrigger>

      <PopoverContent class="p-0">
        <Command>
          <CommandInput placeholder={t('gestorias.client-switcher.search')} />
          <CommandList>
            <CommandEmpty>{t('gestorias.client-switcher.empty')}</CommandEmpty>
            <For each={props.clients}>
              {client => (
                <CommandItem
                  value={client.organizationId}
                  keywords={[client.name, client.legalName ?? '', client.taxId ?? '']}
                  onSelect={() => {
                    setIsOpen(false);
                    navigate(getGestoriaClientHref({ gestoriaId: props.gestoriaId, client }));
                  }}
                  class="gap-2"
                >
                  <DiceBearAvatar seed={client.organizationId} type="organization" alt="" class="size-6 shrink-0 rounded-sm border" />
                  <span class="min-w-0 flex-1">
                    <span class="block truncate">{client.name}</span>
                    <Show when={client.taxId || client.legalName}>
                      <span class="block truncate text-xs text-muted-foreground">{[client.taxId, client.legalName !== client.name ? client.legalName : null].filter(Boolean).join(' · ')}</span>
                    </Show>
                  </span>
                  <Show when={client.organizationId === props.currentClient?.organizationId}>
                    <div class="i-tabler-check size-4 shrink-0" />
                  </Show>
                </CommandItem>
              )}
            </For>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}
