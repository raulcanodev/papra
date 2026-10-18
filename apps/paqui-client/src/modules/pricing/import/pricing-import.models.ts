import type { ImportConceptKind, PricingImportBlock, PricingImportInput, PricingImportProduct, PricingImportProposal } from './pricing-import.types';

/** What a concept row of the file becomes: a line of the cost breakdown, the shipping of the product, or nothing */
export type ConceptTreatment = 'cost' | 'shipping' | 'skip';

/** Target of a product of the file: a new product, an existing one (its id) or not imported */
export const CREATE_PRODUCT = '';
export const SKIP_PRODUCT = 'skip';

export type ImportDecisions = {
  includedBlockIds: ReadonlySet<string>;
  /** By concept key (block and position) */
  treatments: Record<string, ConceptTreatment>;
  /** By product key */
  productTargets: Record<string, string>;
};

export type ImportPriceListChoice = { mode: 'new'; name: string } | { mode: 'existing'; priceListId: string } | { mode: 'none' };

export const IMPORT_FILE_ACCEPT = '.xlsx,.xlsm,.csv,.tsv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,text/csv';

export function getConceptKey({ blockId, index }: { blockId: string; index: number }) {
  return `${blockId}:${index}`;
}

// Selling costs (an agent, a commission) are not what making the product costs: they wait for the user to decide
export function getDefaultTreatment(kind: ImportConceptKind): ConceptTreatment {
  return kind === 'commission' ? 'skip' : kind;
}

/** Blocks whose lines do not add up to their total start unticked: the user decides which figure is right */
export function getDefaultDecisions({ proposal }: { proposal: PricingImportProposal }): ImportDecisions {
  return {
    includedBlockIds: new Set(proposal.blocks.filter(block => block.isBalanced).map(block => block.id)),
    treatments: Object.fromEntries(proposal.blocks.flatMap(block => block.concepts.map((concept, index) => [getConceptKey({ blockId: block.id, index }), getDefaultTreatment(concept.kind)]))),
    productTargets: Object.fromEntries(proposal.blocks.flatMap(block => block.products.map(product => [product.key, product.matchedProduct?.id ?? CREATE_PRODUCT]))),
  };
}

/** What a product will have once imported, with the decisions taken on its concepts */
export function getProductPreview({ block, product, treatments }: { block: PricingImportBlock; product: PricingImportProduct; treatments: Record<string, ConceptTreatment> }) {
  const lines = block.concepts.map((concept, index) => ({ name: concept.name, amountMinor: product.amounts[index] ?? 0, treatment: treatments[getConceptKey({ blockId: block.id, index })] ?? getDefaultTreatment(concept.kind) }));
  // A cost line is never negative nor empty: those stay out of the breakdown
  const costLines = lines.filter(line => line.treatment === 'cost' && line.amountMinor > 0).map(line => ({ conceptName: line.name, amountMinor: line.amountMinor }));
  const shippingLines = lines.filter(line => line.treatment === 'shipping' && line.amountMinor > 0);
  const costMinor = costLines.reduce((total, line) => total + line.amountMinor, 0);
  const shippingMinor = shippingLines.reduce((total, line) => total + line.amountMinor, 0);
  const skippedMinor = lines.filter(line => line.treatment === 'skip').reduce((total, line) => total + line.amountMinor, 0);

  return {
    costLines,
    costMinor,
    shipping: shippingMinor > 0 ? { name: [...new Set(shippingLines.map(line => line.name))].join(' + '), amountMinor: shippingMinor } : null,
    skippedMinor,
    priceMinor: product.priceMinor,
    // The margin the app will show: price minus breakdown minus shipping (what is left out is not counted)
    marginMinor: product.priceMinor === null ? null : product.priceMinor - costMinor - shippingMinor,
  };
}

export function getImportedProducts({ proposal, decisions }: { proposal: PricingImportProposal; decisions: ImportDecisions }) {
  return proposal.blocks
    .filter(block => decisions.includedBlockIds.has(block.id))
    .flatMap(block => block.products.map(product => ({ block, product, target: decisions.productTargets[product.key] ?? CREATE_PRODUCT })))
    .filter(({ target }) => target !== SKIP_PRODUCT);
}

export function buildImportInput({ proposal, decisions, priceList }: { proposal: PricingImportProposal; decisions: ImportDecisions; priceList: ImportPriceListChoice }): PricingImportInput {
  return {
    priceList: priceList.mode === 'none' ? null : priceList.mode === 'new' ? { mode: 'new', name: priceList.name.trim() } : priceList,
    products: getImportedProducts({ proposal, decisions }).map(({ block, product, target }) => {
      const { costLines, priceMinor, shipping } = getProductPreview({ block, product, treatments: decisions.treatments });
      return { productId: target === CREATE_PRODUCT ? null : target, name: product.name, costLines, priceMinor, shipping };
    }),
  };
}

/** "Escandallos 2026.xlsx" -> "Escandallos 2026" */
export function getDefaultPriceListName({ fileName }: { fileName: string }) {
  return fileName.replace(/\.[a-z0-9]+$/i, '').trim().slice(0, 200);
}
