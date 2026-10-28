import type { PurchaseInvoice, PurchaseInvoiceStatus } from '../purchases.types';
import { useNavigate } from '@solidjs/router';
import { createMutation } from '@tanstack/solid-query';
import { getDueDatesQueryKey } from '@/modules/due-dates/due-dates.services';
import { useI18n } from '@/modules/i18n/i18n.provider';
import { queryClient } from '@/modules/shared/query/query-client';
import { RowActions } from '@/modules/ui/components/row-actions';
import { createToast } from '@/modules/ui/components/sonner';
import { getOrganizationRouteChildHref } from '@/modules/ui/navigation/organization-navigation';
import { useLinkWithReturn } from '@/modules/ui/navigation/return-to';
import { deletePurchaseInvoice, getPurchaseInvoicesQueryKey, setPurchaseInvoiceStatus } from '../purchases.services';

/** The editor of a purchase, coming back to the page it was opened from (the list, a supplier...) */
export function usePurchaseEditHref({ organizationId }: { organizationId: () => string }) {
  const linkWithReturn = useLinkWithReturn();

  return (purchaseInvoiceId: string) => linkWithReturn(getOrganizationRouteChildHref({ organizationId: organizationId(), routeId: 'purchases', childPath: `${purchaseInvoiceId}/edit` }));
}

/** The ⋯ of a purchase row, the same wherever the purchase is listed */
export function PurchaseRowActions(props: { organizationId: string; purchaseInvoice: PurchaseInvoice }) {
  const { t } = useI18n();
  const navigate = useNavigate();
  const editHref = usePurchaseEditHref({ organizationId: () => props.organizationId });

  const statusMutation = createMutation(() => ({
    mutationFn: ({ purchaseInvoiceId, status }: { purchaseInvoiceId: string; status: PurchaseInvoiceStatus }) => setPurchaseInvoiceStatus({ organizationId: props.organizationId, purchaseInvoiceId, status }),
    onSuccess: async () => Promise.all([
      queryClient.invalidateQueries({ queryKey: getPurchaseInvoicesQueryKey({ organizationId: props.organizationId }) }),
      queryClient.invalidateQueries({ queryKey: getDueDatesQueryKey({ organizationId: props.organizationId }) }),
    ]),
    onError: () => createToast({ type: 'error', message: t('purchases.toast.error') }),
  }));

  const deleteMutation = createMutation(() => ({
    mutationFn: (purchaseInvoiceId: string) => deletePurchaseInvoice({ organizationId: props.organizationId, purchaseInvoiceId }),
    onSuccess: async () => {
      createToast({ type: 'success', message: t('purchases.toast.deleted') });
      await queryClient.invalidateQueries({ queryKey: getPurchaseInvoicesQueryKey({ organizationId: props.organizationId }) });
    },
    onError: () => createToast({ type: 'error', message: t('purchases.toast.delete-error') }),
  }));

  return (
    <RowActions
      itemName={`${props.purchaseInvoice.supplierName} ${props.purchaseInvoice.number}`}
      actions={[{
        label: props.purchaseInvoice.status === 'pending' ? t('purchases.actions.mark-paid') : t('purchases.actions.mark-pending'),
        icon: props.purchaseInvoice.status === 'pending' ? 'i-tabler-check' : 'i-tabler-clock',
        onSelect: () => statusMutation.mutate({ purchaseInvoiceId: props.purchaseInvoice.id, status: props.purchaseInvoice.status === 'pending' ? 'paid' : 'pending' }),
      }]}
      onEdit={() => navigate(editHref(props.purchaseInvoice.id))}
      onDelete={() => deleteMutation.mutateAsync(props.purchaseInvoice.id)}
      deleteMessage={t('purchases.delete-message')}
    />
  );
}
