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
          'relative h-12 w-full justify-start items-center gap-2 px-2 font-normal truncate hover:bg-sidebar-accent data-[expanded]:bg-sidebar-accent',
          props.class,
        )}
        variant="ghost"
        aria-label={t('user-menu.aria-label')}
      >
        <div class="relative shrink-0">
          <span class="flex size-8 items-center justify-center rounded-full bg-muted text-sm font-medium text-foreground">
            {(props.userName || props.userEmail || '?').trim().charAt(0).toUpperCase()}
          </span>
          <Show when={getPendingInvitationsCount() > 0}>
            <div class="absolute -top-1 -right-1 min-w-4 rounded-full bg-primary px-1 text-center text-[10px] font-semibold leading-4 text-primary-foreground">
              {getPendingInvitationsCount()}
            </div>
          </Show>
        </div>
        <div class="grid min-w-0 flex-1 text-left leading-tight">
          <span class="truncate text-sm font-medium text-foreground">{props.userName || props.userEmail?.split('@')[0]}</span>
          <Show when={props.userEmail}>
            <span class="truncate text-xs text-muted-foreground">{props.userEmail}</span>
          </Show>
        </div>
        <div class="i-tabler-selector size-4 shrink-0 text-muted-foreground" />
      </DropdownMenuTrigger>
      <DropdownMenuContent class="min-w-56">
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
