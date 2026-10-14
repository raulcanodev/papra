import type { DocumentSearchServices } from '../documents/document-search/document-search.types';
import type { SearchHit, SearchKind } from './search.models';
import type { createSearchRepository } from './search.repository';
import { searchOrganizationDocuments } from '../documents/document-search/document-search.usecase';

// One query over every business entity at once, so an assistant (or a person) resolves "the Acme invoice"
// to an id without knowing which table to look into
export async function searchWorkspace({ organizationId, query, kinds, limitPerKind, searchRepository, documentSearchServices }: {
  organizationId: string;
  query: string;
  kinds: SearchKind[];
  limitPerKind: number;
  searchRepository: ReturnType<typeof createSearchRepository>;
  documentSearchServices: DocumentSearchServices;
}) {
  const searchers: Record<SearchKind, () => Promise<SearchHit[]>> = {
    contact: async () => searchRepository.searchContacts({ organizationId, query, limit: limitPerKind }),
    invoice: async () => searchRepository.searchInvoices({ organizationId, query, limit: limitPerKind }),
    purchase_invoice: async () => searchRepository.searchPurchaseInvoices({ organizationId, query, limit: limitPerKind }),
    product: async () => searchRepository.searchProducts({ organizationId, query, limit: limitPerKind }),
    document: async () => {
      const { documents } = await searchOrganizationDocuments({ searchQuery: query, organizationId, pageIndex: 0, pageSize: limitPerKind, documentSearchServices });

      return documents.map(document => ({ kind: 'document', id: document.id, title: document.name, subtitle: document.mimeType, matchedOn: 'name or content' }));
    },
  };

  const hitsByKind = await Promise.all(kinds.map(async kind => searchers[kind]()));

  return { query, results: hitsByKind.flat() };
}
