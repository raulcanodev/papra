import type { InvoicingProduct } from '../invoicing.types';

export type ProductSearchCandidate = {
  product: InvoicingProduct;
  name: string;
  nameWords: string[];
  description: string;
  searchable: string;
};

export function normalizeProductSearch(value: string) {
  return value
    .normalize('NFD')
    .replace(/[\u0300-\u036F]/g, '')
    .toLocaleLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

export function createProductSearchIndex(products: readonly InvoicingProduct[]): ProductSearchCandidate[] {
  return products.map((product) => {
    const name = normalizeProductSearch(product.name);
    const description = normalizeProductSearch(product.description ?? '');
    const owner = normalizeProductSearch(product.contactName ?? '');
    return { product, name, nameWords: name.split(' '), description, searchable: `${name} ${description} ${owner}`.trim() };
  });
}

function getMatchScore(candidate: ProductSearchCandidate, normalizedQuery: string, queryWords: string[]) {
  const { name, nameWords, description, searchable } = candidate;

  if (name === normalizedQuery) {
    return 0;
  }
  if (name.startsWith(normalizedQuery)) {
    return 1;
  }
  if (queryWords.every(word => nameWords.some(nameWord => nameWord.startsWith(word)))) {
    return 2;
  }
  if (name.includes(normalizedQuery)) {
    return 3;
  }
  if (description.startsWith(normalizedQuery)) {
    return 4;
  }
  if (queryWords.every(word => searchable.includes(word))) {
    return 5;
  }
  return null;
}

/** Name matches come first; description/reference and owner still make a product discoverable. */
export function rankProductSearchIndex(index: readonly ProductSearchCandidate[], query: string) {
  const normalizedQuery = normalizeProductSearch(query);
  if (normalizedQuery === '') {
    return index.map(({ product }) => product);
  }

  const queryWords = normalizedQuery.split(' ');
  const buckets: InvoicingProduct[][] = [[], [], [], [], [], []];
  for (const candidate of index) {
    const score = getMatchScore(candidate, normalizedQuery, queryWords);
    if (score !== null) {
      buckets[score]!.push(candidate.product);
    }
  }
  return buckets.flat();
}

export function rankProducts(products: readonly InvoicingProduct[], query: string) {
  return rankProductSearchIndex(createProductSearchIndex(products), query);
}

export function hasExactProductName(products: readonly InvoicingProduct[], name: string) {
  const normalizedName = normalizeProductSearch(name);
  return normalizedName !== '' && products.some(product => normalizeProductSearch(product.name) === normalizedName);
}
