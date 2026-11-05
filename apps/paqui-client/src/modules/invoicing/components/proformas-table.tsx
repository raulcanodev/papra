import type { Invoice } from '../invoicing.types';
import { A } from '@solidjs/router';
import { useQuery } from '@tanstack/solid-query';
import { createMemo, createSignal, For, Show } from 'solid-js';
import { useI18n } from '@/modules/i18n/i18n.provider';
import { Button } from '@/modules/ui/components/button';
import { EntityIcon } from '@/modules/ui/components/entity-icon';
import { TableToolbar } from '@/modules/ui/components/table-toolbar';
import { organizationEntityRoutes } from '@/modules/ui/navigation/organization-navigation';
import { useLinkWithReturn } from '@/modules/ui/navigation/return-to';
import { getInvoicePayableMinor } from '../invoicing.models';
import { fetchInvoices, fetchProformas, getProformasQueryKey } from '../invoicing.services';
import { CatalogCell, CatalogRow, CatalogTable } from './catalog-page';
import { ProformaRowActions, useOpenInvoice } from './invoice-row-actions';
import { getProformaState } from './invoice-row-actions.models';
import { ProformaStateBadge } from './invoice-status-badge';

export function getNewProformaHref({ organizationId }: { organizationId: string }) {
  return `/organizations/${organizationId}/${organizationEntityRoutes.newProforma.path}`;
}

function useProformas({ organizationId }: { organizationId: () => string }) {
  const proformasQuery = useQuery(() => ({ queryKey: getProformasQueryKey({ organizationId: organizationId() }), queryFn: () => fetchProformas({ organizationId: organizationId() }) }));
  // The invoices made from them: their number on the badge, and where a converted proforma opens
  const invoicesQuery = useQuery(() => ({ queryKey: ['invoicing', organizationId(), 'invoices'], queryFn: () => fetchInvoices({ organizationId: organizationId() }) }));

  return {
    proformas: () => proformasQuery.data?.proformas ?? [],
    invoices: () => invoicesQuery.data?.invoices ?? [],
    isLoading: () => proformasQuery.isLoading,
  };
}

function ProformasTable(props: { organizationId: string; proformas: Invoice[]; invoices: Invoice[]; showCustomer?: boolean }) {
  const { t, getLocale } = useI18n();
  const { canOpen, openInvoice } = useOpenInvoice({ organizationId: () => props.organizationId });

  const money = (proforma: Invoice) => new Intl.NumberFormat(getLocale(), { style: 'currency', currency: proforma.currency }).format(getInvoicePayableMinor(proforma) / 100);
  const getInvoice = (proforma: Invoice) => props.invoices.find(({ id }) => id === proforma.convertedInvoiceId);
  // Once it has its invoice, that invoice is what matters: a proforma that was converted opens it
  const getOpenTarget = (proforma: Invoice) => getProformaState(proforma) === 'converted' ? getInvoice(proforma) : proforma;
  const getOnClick = (proforma: Invoice) => {
    const target = getOpenTarget(proforma);
    return target && canOpen(target) ? () => openInvoice(target) : undefined;
  };

  return (
    <CatalogTable headers={[...(props.showCustomer === true ? [{ label: t('invoicing.invoices.table.customer') }] : []), { label: t('invoicing.invoices.table.issue-date') }, { label: t('invoicing.invoices.table.status') }, { label: t('invoicing.invoices.table.total'), class: 'text-right' }, { label: '', class: 'w-14' }]}>
      <For each={props.proformas}>
        {proforma => (
          <CatalogRow onClick={getOnClick(proforma)}>
            <Show when={props.showCustomer === true}>
              <CatalogCell class="font-medium">
                <div class="flex items-center gap-2">
                  <EntityIcon icon={proforma.customerIcon} color={proforma.customerIconColor} fallback="i-tabler-building" size="sm" />
                  <span class="truncate">{proforma.customerName}</span>
                </div>
              </CatalogCell>
            </Show>
            <CatalogCell class="text-muted-foreground">{proforma.issueDate.toLocaleDateString(getLocale())}</CatalogCell>
            <CatalogCell><ProformaStateBadge state={getProformaState(proforma)} invoiceNumber={getInvoice(proforma)?.number} /></CatalogCell>
            <CatalogCell class="text-right font-medium tabular-nums">{money(proforma)}</CatalogCell>
            <CatalogCell><ProformaRowActions organizationId={props.organizationId} proforma={proforma} /></CatalogCell>
          </CatalogRow>
        )}
      </For>
    </CatalogTable>
  );
}

// The proformas tab of the sales page
export function ProformasTab(props: { organizationId: string }) {
  const { t } = useI18n();
  const [search, setSearch] = createSignal('');
  const { proformas, invoices, isLoading } = useProformas({ organizationId: () => props.organizationId });
  const filtered = createMemo(() => proformas().filter(proforma => (proforma.customerName ?? '').toLowerCase().includes(search().toLowerCase())));

  return (
    <>
      <TableToolbar search={search()} onSearchChange={setSearch} searchPlaceholder={t('invoicing.proformas.search')} fields={[]} filters={[]} onFiltersChange={() => {}} />
      <Show when={!isLoading() && filtered().length === 0}>
        <div class="rounded-xl border border-dashed px-4 py-16 text-center">
          <div class="i-tabler-file-description size-9 mx-auto text-muted-foreground/50 mb-3" />
          <div class="font-medium">{t('invoicing.proformas.empty.title')}</div>
          <div class="mx-auto mt-1 max-w-md text-sm text-muted-foreground">{t('invoicing.proformas.empty.description')}</div>
        </div>
      </Show>
      <Show when={filtered().length > 0}>
        <ProformasTable organizationId={props.organizationId} proformas={filtered()} invoices={invoices()} showCustomer />
      </Show>
    </>
  );
}

// The proformas of one customer, on its contact page
export function ContactProformas(props: { organizationId: string; contactId: string }) {
  const { t } = useI18n();
  const linkWithReturn = useLinkWithReturn();
  const { proformas, invoices, isLoading } = useProformas({ organizationId: () => props.organizationId });
  const contactProformas = createMemo(() => proformas().filter(({ customerId }) => customerId === props.contactId));
  const newHref = () => linkWithReturn(`${getNewProformaHref({ organizationId: props.organizationId })}?customerId=${encodeURIComponent(props.contactId)}`);

  return (
    <>
      <div class="mb-3 flex items-center justify-between gap-3">
        <p class="text-sm text-muted-foreground">{t('contacts.detail.proformas.description')}</p>
        <Button as={A} size="sm" class="shrink-0 gap-1.5" href={newHref()}>
          <div class="i-tabler-plus size-4" />
          {t('contacts.detail.proformas.new')}
        </Button>
      </div>
      <Show when={contactProformas().length > 0} fallback={<Show when={!isLoading()}><div class="rounded-xl border border-dashed py-10 text-center text-sm text-muted-foreground">{t('contacts.detail.proformas.empty')}</div></Show>}>
        <ProformasTable organizationId={props.organizationId} proformas={contactProformas()} invoices={invoices()} />
      </Show>
    </>
  );
}
