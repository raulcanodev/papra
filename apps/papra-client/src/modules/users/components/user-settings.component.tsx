import type { Component } from 'solid-js';
import { A, useNavigate } from '@solidjs/router';
import { Show } from 'solid-js';
import { signOut } from '@/modules/auth/auth.services';
import { useI18n } from '@/modules/i18n/i18n.provider';
import { usePendingInvitationsCount } from '@/modules/invitations/composables/usePendingInvitationsCount';
import { useAboutDialog } from '@/modules/shared/components/about-dialog';
import { cn } from '@/modules/shared/style/cn';
import { ThemeSwitcher } from '@/modules/theme/theme-switcher.component';
import { Button } from '@/modules/ui/components/button';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSub, DropdownMenuSubContent, DropdownMenuSubTrigger, DropdownMenuTrigger } from '@/modules/ui/components/dropdown-menu';
import { LanguageSwitcher } from '@/modules/ui/layouts/sidenav.layout';

export const UserSettingsDropdown: Component<{ class?: string; userName?: string | null; userEmail?: string }> = (props) => {
  const { getPendingInvitationsCount } = usePendingInvitationsCount();
  const aboutDialog = useAboutDialog();
  const { t } = useI18n();
  const navigate = useNavigate();

  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        as={Button}
        class={cn(
          'relative w-full justify-start items-center gap-2 dark:text-muted-foreground truncate',
          props.class,
        )}
        variant="ghost"
        aria-label="User menu"
      >
        <div class="relative shrink-0">
          <div class="i-tabler-user size-5 text-muted-foreground opacity-50" />
          <Show when={getPendingInvitationsCount() > 0}>
            <div class="absolute -top-1.5 -right-1.5 bg-primary text-primary-foreground rounded-xl text-xs px-1 leading-tight font-bold">
              {getPendingInvitationsCount()}
            </div>
          </Show>
        </div>
        <Show when={props.userName || props.userEmail}>
          <div class="flex flex-col items-start min-w-0 flex-1">
            <Show when={props.userName}>
              <span class="text-sm font-medium truncate leading-tight text-foreground">{props.userName}</span>
            </Show>
            <Show when={props.userEmail}>
              <span class="text-xs text-muted-foreground truncate leading-tight">{props.userEmail}</span>
            </Show>
          </div>
        </Show>
      </DropdownMenuTrigger>
      <DropdownMenuContent class="min-w-48">
        <DropdownMenuItem class="flex items-center gap-2 cursor-pointer" as={A} href="/settings">
          <div class="i-tabler-settings size-4 text-muted-foreground" />
          {t('user-menu.account-settings')}
        </DropdownMenuItem>

        <DropdownMenuItem class="flex items-center gap-2 cursor-pointer" as={A} href="/api-keys">
          <div class="i-tabler-key size-4 text-muted-foreground" />
          {t('user-menu.api-keys')}
        </DropdownMenuItem>

        <DropdownMenuItem class="flex items-center gap-2 cursor-pointer" as={A} href="/invitations">
          <div class="i-tabler-mail-plus size-4 text-muted-foreground" />
          {t('user-menu.invitations')}
          <Show when={getPendingInvitationsCount() > 0}>
            <div class="ml-auto bg-primary text-primary-foreground rounded-xl text-xs px-1.5 py-0.8 font-bold leading-none">
              {getPendingInvitationsCount()}
            </div>
          </Show>
        </DropdownMenuItem>

        <DropdownMenuSub>
          <DropdownMenuSubTrigger class="flex items-center gap-2 cursor-pointer">
            <div class="i-tabler-language size-4 text-muted-foreground" />
            {t('user-menu.language')}
          </DropdownMenuSubTrigger>
          <DropdownMenuSubContent class="min-w-48">
            <LanguageSwitcher />
          </DropdownMenuSubContent>
        </DropdownMenuSub>

        <DropdownMenuSub>
          <DropdownMenuSubTrigger class="flex items-center gap-2 cursor-pointer">
            <div class="i-tabler-sun-moon size-4 text-muted-foreground" />
            {t('user-menu.theme')}
          </DropdownMenuSubTrigger>
          <DropdownMenuSubContent class="min-w-48">
            <ThemeSwitcher />
          </DropdownMenuSubContent>
        </DropdownMenuSub>

        <DropdownMenuItem
          onClick={() => aboutDialog.open()}
          class="flex items-center gap-2 cursor-pointer"
        >
          <div class="i-tabler-info-circle size-4 text-muted-foreground" />
          {t('user-menu.about')}
        </DropdownMenuItem>

        <DropdownMenuItem
          onClick={async () => {
            await signOut();
            navigate('/login');
          }}
          class="flex items-center gap-2 cursor-pointer"
        >
          <div class="i-tabler-logout size-4 text-muted-foreground" />
          {t('user-menu.logout')}
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
};
