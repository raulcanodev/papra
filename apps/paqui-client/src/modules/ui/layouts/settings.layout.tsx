import type { ParentComponent } from 'solid-js';
import { A } from '@solidjs/router';
import { useI18n } from '@/modules/i18n/i18n.provider';
import { SideNav } from '@/modules/ui/components/sidenav';
import { Button } from '../components/button';
import { AppShell, ShellBreadcrumb } from './sidenav.layout';

export const SettingsLayout: ParentComponent = (props) => {
  const { t } = useI18n();

  const getMainMenuItems = () => [
    {
      label: t('layout.menu.account'),
      icon: 'i-tabler-user',
      href: '/settings',
    },
    {
      label: t('layout.menu.api-keys'),
      icon: 'i-tabler-key',
      href: '/api-keys',
    },
    {
      label: t('layout.menu.invitations'),
      icon: 'i-tabler-mail',
      href: '/invitations',
    },
  ];

  const sideNav = () => (
    <SideNav
      mainMenu={getMainMenuItems()}
      header={() => (
        <div class="flex h-12 items-center gap-1 px-1">
          <Button variant="ghost" size="icon-sm" class="text-muted-foreground" as={A} href="/" aria-label={t('layout.back')}>
            <div class="i-tabler-arrow-left size-4" />
          </Button>
          <h1 class="text-sm font-semibold">
            {t('layout.menu.settings')}
          </h1>
        </div>
      )}
    />
  );

  return (
    <AppShell sideNav={sideNav} header={() => <ShellBreadcrumb title={t('layout.menu.settings')} />}>
      {props.children}
    </AppShell>
  );
};
