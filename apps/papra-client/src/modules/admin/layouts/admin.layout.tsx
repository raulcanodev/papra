import type { ParentComponent } from 'solid-js';
import { A, Navigate } from '@solidjs/router';
import { Show } from 'solid-js';
import { useI18n } from '@/modules/i18n/i18n.provider';
import { SideNav } from '@/modules/ui/components/sidenav';
import { AppShell, ShellBreadcrumb } from '@/modules/ui/layouts/sidenav.layout';
import { useCurrentUser } from '@/modules/users/composables/useCurrentUser';

const AdminLayout: ParentComponent = (props) => {
  const { t } = useI18n();

  const getNavigationMenu = () => [
    {
      label: t('admin.layout.menu.analytics'),
      href: '/admin/analytics',
      icon: 'i-tabler-chart-bar',
    },
    {
      label: t('admin.layout.menu.users'),
      href: '/admin/users',
      icon: 'i-tabler-users',
    },
    {
      label: t('admin.layout.menu.organizations'),
      href: '/admin/organizations',
      icon: 'i-tabler-building-community',
    },
    {
      label: t('admin.layout.menu.feature-flags'),
      href: '/admin/feature-flags',
      icon: 'i-tabler-flag',
    },
    {
      label: 'VERI*FACTU',
      href: '/admin/verifactu',
      icon: 'i-tabler-receipt-tax',
    },
  ];

  const sideNav = () => (
    <SideNav
      header={() => (
        <A href="/admin" class="flex h-12 items-center gap-2 rounded-md px-2 transition-colors hover:bg-sidebar-accent">
          <span class="flex size-8 shrink-0 items-center justify-center rounded-md bg-primary text-primary-foreground">
            <div class="i-tabler-shield-lock size-4" />
          </span>
          <span class="truncate text-sm font-semibold">
            {t('admin.layout.header')}
          </span>
        </A>
      )}
      mainMenu={getNavigationMenu()}
      footerMenu={[{ label: t('admin.layout.back-to-app'), icon: 'i-tabler-arrow-left', href: '/' }]}
    />
  );

  return (
    <AppShell sideNav={sideNav} header={() => <ShellBreadcrumb title={t('admin.layout.header')} />}>
      {props.children}
    </AppShell>
  );
};

export const GuardedAdminLayout: ParentComponent = (props) => {
  const { hasPermission } = useCurrentUser();

  return (
    <Show
      when={hasPermission('bo:access')}
      fallback={<Navigate href="/" />}
    >
      <AdminLayout {...props} />
    </Show>
  );
};

export default GuardedAdminLayout;
