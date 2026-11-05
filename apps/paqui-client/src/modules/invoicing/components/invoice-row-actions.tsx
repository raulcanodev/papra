import type { Invoice } from '../invoicing.types';
import { useNavigate } from '@solidjs/router';
import { createMutation } from '@tanstack/solid-query';
import { useI18n } from '@/modules/i18n/i18n.provider';
import { queryClient } from '@/modules/shared/query/query-client';
import { RowActions } from '@/modules/ui/components/row-actions';
import { createToast } from '@/modules/ui/components/sonner';
import { getOrganizationRouteChildHref } from '@/modules/ui/navigation/organization-navigation';
import { useLinkWithReturn } from '@/modules/ui/navigation/return-to';
import { convertProforma, deleteDraftInvoice, deleteImportedInvoice, downloadInvoicePdf, markInvoicePaid, sendInvoice } from '../invoicing.services';
import { canDeleteInvoice, getProformaState } from './invoice-row-actions.models';

/**
 * Opening an issued invoice from a table: a draft or a proforma opens in the editor; an issued invoice is a legal record,
 * it opens as its archived PDF. Both come back to the page they were opened from (the list, a contact...).
 */
export function useOpenInvoice({ organizationId }: { organizationId: () => string }) {
  const navigate = useNavigate();
  const linkWithReturn = useLinkWithReturn();

  const editHref = (invoice: Invoice) => linkWithReturn(getOrganizationRouteChildHref({ organizationId: organizationId(), routeId: 'invoices', childPath: `${invoice.id}/edit` }));
  const opensInEditor = (invoice: Invoice) => invoice.status === 'draft' || invoice.status === 'proforma';
  const canOpen = (invoice: Invoice) => opensInEditor(invoice) || invoice.documentId !== null;
  const openInvoice = (invoice: Invoice) => {
    if (opensInEditor(invoice)) {
      navigate(editHref(invoice));
    } else if (invoice.documentId !== null) {
      navigate(linkWithReturn(`/organizations/${organizationId()}/documents/${invoice.documentId}`));
    }
  };

  return { editHref, canOpen, openInvoice };
}

/** The ⋯ of an issued invoice row, the same wherever the invoice is listed */
export function InvoiceRowActions(props: { organizationId: string; invoice: Invoice }) {
  const { t } = useI18n();
  const navigate = useNavigate();
  const { editHref } = useOpenInvoice({ organizationId: () => props.organizationId });

  const refresh = () => queryClient.invalidateQueries({ queryKey: ['invoicing', props.organizationId, 'invoices'] });
  const sendMutation = createMutation(() => ({
    mutationFn: (invoiceId: string) => sendInvoice({ organizationId: props.organizationId, invoiceId }),
    onSuccess: async () => {
      createToast({ type: 'success', message: t('invoicing.invoices.toast.sent') });
      await refresh();
    },
    onError: () => createToast({ type: 'error', message: t('invoicing.invoices.toast.send-error') }),
  }));
  const deleteMutation = createMutation(() => ({
    mutationFn: (invoiceId: string) => props.invoice.importedAt
      ? deleteImportedInvoice({ organizationId: props.organizationId, invoiceId })
      : deleteDraftInvoice({ organizationId: props.organizationId, invoiceId }),
    onSuccess: async () => {
      createToast({ type: 'success', message: t(props.invoice.importedAt ? 'invoicing.invoices.toast.imported-deleted' : 'invoicing.invoices.toast.deleted') });
      await refresh();
    },
    onError: () => createToast({ type: 'error', message: t(props.invoice.importedAt ? 'invoicing.invoices.toast.imported-delete-error' : 'invoicing.invoices.toast.delete-error') }),
  }));
  const paidMutation = createMutation(() => ({ mutationFn: (invoiceId: string) => markInvoicePaid({ organizationId: props.organizationId, invoiceId }), onSuccess: refresh }));

  return (
    <RowActions
      itemName={props.invoice.number ?? t('invoicing.status.draft')}
      actions={[
        ...(props.invoice.status === 'draft' || props.invoice.status === 'issued' ? [{ label: t('invoicing.invoices.actions.send'), icon: 'i-tabler-send', onSelect: () => sendMutation.mutate(props.invoice.id) }] : []),
        ...(props.invoice.status !== 'draft' && props.invoice.status !== 'issuing' ? [{ label: t('invoicing.invoices.actions.download'), icon: 'i-tabler-download', onSelect: () => void downloadInvoicePdf({ organizationId: props.organizationId, invoiceId: props.invoice.id, filename: props.invoice.number ?? props.invoice.id }) }] : []),
        ...(props.invoice.status === 'issued' || props.invoice.status === 'sent' ? [{ label: t('invoicing.invoices.actions.mark-paid'), icon: 'i-tabler-check', onSelect: () => paidMutation.mutate(props.invoice.id) }] : []),
      ]}
      // Paqui-issued invoices are legal records. An imported one is only an external paper registered as a sale,
      // so its mistaken registration can be removed while the source file stays in Documents.
      onEdit={props.invoice.status === 'draft' ? () => navigate(editHref(props.invoice)) : undefined}
      onDelete={() => deleteMutation.mutateAsync(props.invoice.id)}
      deleteDisabled={!canDeleteInvoice(props.invoice)}
      deleteMessage={props.invoice.importedAt ? t('invoicing.invoices.delete-imported-message') : undefined}
    />
  );
}

/** The ⋯ of a proforma row: it can change until it has its invoice, and that invoice is reviewed before it is issued */
export function ProformaRowActions(props: { organizationId: string; proforma: Invoice }) {
  const { t } = useI18n();
  const navigate = useNavigate();
  const { editHref } = useOpenInvoice({ organizationId: () => props.organizationId });
  const isConverted = () => getProformaState(props.proforma) === 'converted';

  const refresh = () => queryClient.invalidateQueries({ queryKey: ['invoicing', props.organizationId, 'invoices'] });
  const convertMutation = createMutation(() => ({
    mutationFn: () => convertProforma({ organizationId: props.organizationId, invoiceId: props.proforma.id }),
    onSuccess: async ({ invoice }) => {
      await refresh();
      createToast({ type: 'success', message: t('invoicing.proformas.toast.converted') });
      navigate(editHref(invoice));
    },
    onError: () => createToast({ type: 'error', message: t('invoicing.proformas.toast.convert-error') }),
  }));
  const sendMutation = createMutation(() => ({
    mutationFn: () => sendInvoice({ organizationId: props.organizationId, invoiceId: props.proforma.id }),
    onSuccess: async () => {
      createToast({ type: 'success', message: t('invoicing.proformas.toast.sent') });
      await refresh();
    },
    onError: () => createToast({ type: 'error', message: t('invoicing.proformas.toast.send-error') }),
  }));
  const downloadMutation = createMutation(() => ({
    mutationFn: () => downloadInvoicePdf({ organizationId: props.organizationId, invoiceId: props.proforma.id, filename: `proforma-${props.proforma.customerName ?? props.proforma.id}` }),
    onError: () => createToast({ type: 'error', message: t('invoicing.proformas.toast.download-error') }),
  }));
  const deleteMutation = createMutation(() => ({
    mutationFn: () => deleteDraftInvoice({ organizationId: props.organizationId, invoiceId: props.proforma.id }),
    onSuccess: async () => {
      createToast({ type: 'success', message: t('invoicing.proformas.toast.deleted') });
      await refresh();
    },
    onError: () => createToast({ type: 'error', message: t('invoicing.proformas.toast.delete-error') }),
  }));

  return (
    <RowActions
      itemName={t('invoicing.status.proforma')}
      actions={[
        ...(isConverted() ? [] : [{ label: t('invoicing.proformas.actions.convert'), icon: 'i-tabler-file-invoice', onSelect: () => convertMutation.mutate() }]),
        { label: t('invoicing.invoices.actions.send'), icon: 'i-tabler-send', onSelect: () => sendMutation.mutate() },
        { label: t('invoicing.invoices.actions.download'), icon: 'i-tabler-download', onSelect: () => downloadMutation.mutate() },
      ]}
      onEdit={isConverted() ? undefined : () => navigate(editHref(props.proforma))}
      onDelete={() => deleteMutation.mutateAsync()}
    />
  );
}
