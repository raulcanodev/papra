import { A, useParams } from '@solidjs/router';
import { For } from 'solid-js';
import { useI18n } from '@/modules/i18n/i18n.provider';
import { getOrganizationRouteHref } from '@/modules/ui/navigation/organization-navigation';

/** Issued and received invoices share one menu entry, switched with these tabs */
export function InvoicesTabs() {
  const { t } = useI18n();
  const params = useParams();

  const tabs = () => [
    { href: getOrganizationRouteHref({ organizationId: params.organizationId, routeId: 'invoices' }), label: t('invoicing.tabs.issued'), icon: 'i-tabler-file-arrow-right' },
    { href: getOrganizationRouteHref({ organizationId: params.organizationId, routeId: 'purchases' }), label: t('invoicing.tabs.received'), icon: 'i-tabler-file-arrow-left' },
  ];

  return (
    <nav class="mb-5 flex gap-1 border-b" aria-label={t('invoicing.tabs.label')}>
      <For each={tabs()}>
        {tab => (
          <A
            href={tab.href}
            end
            class="-mb-px flex items-center gap-1.5 border-b-2 border-transparent px-3 py-2 text-sm text-muted-foreground transition-colors hover:text-foreground"
            activeClass="border-primary! font-medium text-foreground!"
          >
            <div class={`${tab.icon} size-4`} />
            {tab.label}
          </A>
        )}
      </For>
    </nav>
  );
}
