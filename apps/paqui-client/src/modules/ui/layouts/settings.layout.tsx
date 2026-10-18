import type { ParentComponent } from 'solid-js';
import type { SideNavMenuSection } from '@/modules/ui/components/sidenav';
import { A } from '@solidjs/router';
import { useI18n } from '@/modules/i18n/i18n.provider';
import { usePendingInvitationsCount } from '@/modules/invitations/composables/usePendingInvitationsCount';
import { SideNav } from '@/modules/ui/components/sidenav';
import { Button } from '../components/button';
import { AppShell, ShellBreadcrumb } from './sidenav.layout';

export const SettingsLayout: ParentComponent = (props) => {
  const { t } = useI18n();

  const { getPendingInvitationsCount } = usePendingInvitationsCount();

  // The account, then what developers need (API keys, and the MCP connections later on)
  const getMainSections = (): SideNavMenuSection[] => [
    {
      id: 'account',
      items: [
        { label: t('layout.menu.account'), icon: 'i-tabler-user', href: '/settings' },
        {
          label: t('layout.menu.invitations'),
          icon: 'i-tabler-mail',
          href: '/invitations',
          badge: getPendingInvitationsCount() > 0 ? <span class="rounded-full bg-primary px-1.5 text-[10px] font-semibold leading-4 text-primary-foreground">{getPendingInvitationsCount()}</span> : undefined,
        },
      ],
    },
    {
      id: 'developers',
      label: t('layout.menu.developers'),
      items: [
        { label: t('layout.menu.api-keys'), icon: 'i-tabler-key', href: '/api-keys' },
      ],
    },
  ];

  const sideNav = () => (
    <SideNav
      mainSections={getMainSections()}
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
