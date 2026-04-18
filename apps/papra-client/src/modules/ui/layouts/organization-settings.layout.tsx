import type { ParentComponent } from 'solid-js';
import { A, useParams } from '@solidjs/router';
import { useI18n } from '@/modules/i18n/i18n.provider';
import { SideNav } from '@/modules/ui/components/sidenav';
import { Button } from '../components/button';
import { Sheet, SheetContent, SheetTrigger } from '../components/sheet';

export const OrganizationSettingsLayout: ParentComponent = (props) => {
  const params = useParams();
  const { t } = useI18n();

  const getNavigationItems = () => [
    {
      label: t('layout.menu.general-settings'),
      href: `/organizations/${params.organizationId}/settings`,
      icon: 'i-tabler-settings',
    },
    {
      label: t('layout.menu.usage'),
      href: `/organizations/${params.organizationId}/settings/usage`,
      icon: 'i-tabler-chart-bar',
    },
    {
      label: t('layout.menu.intake-emails'),
      href: `/organizations/${params.organizationId}/settings/intake-emails`,
      icon: 'i-tabler-mail',
    },
    {
      label: t('layout.menu.webhooks'),
      href: `/organizations/${params.organizationId}/settings/webhooks`,
      icon: 'i-tabler-webhook',
    },
  ];

  const sidenav = () => (
    <SideNav
      mainMenu={getNavigationItems()}
      header={() => (
        <div class="pl-6 py-3 border-b border-b-border flex items-center gap-1">
          <Button variant="ghost" size="icon" class="text-muted-foreground" as={A} href={`/organizations/${params.organizationId}`}>
            <div class="i-tabler-arrow-left size-5" />
          </Button>
          <h1 class="text-base font-bold">
            {t('organization.settings.title')}
          </h1>
        </div>
      )}
    />
  );

  return (
    <div class="flex flex-row h-screen min-h-0">
      <div class="w-280px border-r border-r-border flex-shrink-0 hidden md:block bg-card">
        {sidenav()}
      </div>
      <div class="flex-1 min-h-0 flex flex-col">
        <header class="h-14 flex items-center px-4 border-b bg-card md:hidden">
          <Sheet>
            <SheetTrigger>
              <Button variant="ghost" size="icon" class="mr-2">
                <div class="i-tabler-menu-2 size-6" />
              </Button>
            </SheetTrigger>
            <SheetContent side="left" class="bg-card p-0!">
              {sidenav()}
            </SheetContent>
          </Sheet>
          <span class="font-semibold text-sm">{t('organization.settings.title')}</span>
        </header>
        {props.children}
      </div>
    </div>
  );
};
