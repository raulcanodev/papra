import type { Invoice } from '../invoicing.types';
import { useNavigate } from '@solidjs/router';
import { createMutation } from '@tanstack/solid-query';
import { useI18n } from '@/modules/i18n/i18n.provider';
import { queryClient } from '@/modules/shared/query/query-client';
import { RowActions } from '@/modules/ui/components/row-actions';
import { createToast } from '@/modules/ui/components/sonner';
import { getOrganizationRouteChildHref } from '@/modules/ui/navigation/organization-navigation';
import { useLinkWithReturn } from '@/modules/ui/navigation/return-to';
import { deleteDraftInvoice, downloadInvoicePdf, markInvoicePaid, sendInvoice } from '../invoicing.services';

/**
 * Opening an issued invoice from a table: a draft opens in the editor; an issued invoice is a legal record, it opens as
 * its archived PDF. Both come back to the page they were opened from (the list, a contact...).
 */
export function useOpenInvoice({ organizationId }: { organizationId: () => string }) {
  const navigate = useNavigate();
  const linkWithReturn = useLinkWithReturn();

  const editHref = (invoice: Invoice) => linkWithReturn(getOrganizationRouteChildHref({ organizationId: organizationId(), routeId: 'invoices', childPath: `${invoice.id}/edit` }));
  const canOpen = (invoice: Invoice) => invoice.status === 'draft' || invoice.documentId !== null;
  const openInvoice = (invoice: Invoice) => {
    if (invoice.status === 'draft') {
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
    mutationFn: (invoiceId: string) => deleteDraftInvoice({ organizationId: props.organizationId, invoiceId }),
    onSuccess: async () => {
      createToast({ type: 'success', message: t('invoicing.invoices.toast.deleted') });
      await refresh();
    },
    onError: () => createToast({ type: 'error', message: t('invoicing.invoices.toast.delete-error') }),
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
      // An issued invoice is a legal record: it is corrected with a credit note, never edited nor deleted
      onEdit={props.invoice.status === 'draft' ? () => navigate(editHref(props.invoice)) : undefined}
      onDelete={() => deleteMutation.mutateAsync(props.invoice.id)}
      deleteDisabled={props.invoice.status !== 'draft'}
    />
  );
}
