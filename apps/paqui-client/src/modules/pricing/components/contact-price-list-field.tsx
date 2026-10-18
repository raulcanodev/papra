import { useQuery } from '@tanstack/solid-query';
import { useI18n } from '@/modules/i18n/i18n.provider';
import { queryClient } from '@/modules/shared/query/query-client';
import { SimpleSelect } from '@/modules/ui/components/simple-select';
import { createToast } from '@/modules/ui/components/sonner';
import { fetchContactPrices, fetchPriceLists, getPricingQueryKey, setContactPriceList } from '../pricing.services';

export function getContactPricesQueryKey({ organizationId, contactId }: { organizationId: string; contactId: string }) {
  return [...getPricingQueryKey({ organizationId }), 'contact-prices', contactId];
}

/** The price list of a contact, changed in place; none means the default price list of the organization */
export function ContactPriceListField(props: { organizationId: string; contactId: string }) {
  const { t } = useI18n();
  const listsQuery = useQuery(() => ({ queryKey: [...getPricingQueryKey({ organizationId: props.organizationId }), 'price-lists'], queryFn: () => fetchPriceLists({ organizationId: props.organizationId }) }));
  const pricesQuery = useQuery(() => ({ queryKey: getContactPricesQueryKey(props), queryFn: () => fetchContactPrices(props) }));

  const defaultList = () => listsQuery.data?.priceLists.find(priceList => priceList.isDefault);
  const value = () => (pricesQuery.data?.isAssigned ? pricesQuery.data.priceList?.id ?? '' : '');

  const change = async (priceListId: string) => {
    try {
      await setContactPriceList({ ...props, priceListId: priceListId === '' ? null : priceListId });
      await queryClient.invalidateQueries({ queryKey: getPricingQueryKey({ organizationId: props.organizationId }) });
      createToast({ type: 'success', message: t('pricing.contact.toast.saved') });
    } catch {
      createToast({ type: 'error', message: t('pricing.contact.toast.error') });
    }
  };

  return (
    <SimpleSelect
      triggerClass="h-9 w-full"
      aria-label={t('pricing.contact.label')}
      value={value()}
      onChange={change}
      options={[
        { value: '', label: defaultList() ? t('pricing.contact.default', { name: defaultList()!.name }) : t('pricing.contact.none') },
        ...(listsQuery.data?.priceLists ?? []).map(priceList => ({ value: priceList.id, label: priceList.name })),
      ]}
    />
  );
}
