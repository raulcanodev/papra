import type { CustomPropertyType } from '../custom-properties/custom-properties.constants';
import { z } from 'zod';
import { CUSTOM_PROPERTY_TYPES } from '../custom-properties/custom-properties.constants';
import { generatePropertyKey } from '../custom-properties/custom-properties.repository.models';
import { NEW_FIELD_REF_PREFIX, NEW_FIELD_TYPES } from './product-scanner.constants';

export type ScannerPropertyDefinition = {
  id: string;
  key: string;
  name: string;
  description: string | null;
  type: CustomPropertyType;
  options: { id: string; name: string }[];
};

function isNonEmpty(value: string | null | undefined): value is string {
  return value !== null && value !== undefined && value.trim() !== '';
}

export type ScannerExistingProduct = { id: string; name: string };

// Each existing field gets its own typed slot in the answer ("f1", "f2"...): the model fills the field it already
// has instead of describing it again. Positional names keep the JSON schema valid whatever the field is called.
function getExistingFieldSlot({ index }: { index: number }) {
  return `f${index + 1}`;
}

function describeDefinition({ definition }: { definition: ScannerPropertyDefinition }) {
  return [`Existing field "${definition.name}"`, isNonEmpty(definition.description) ? `: ${definition.description}` : undefined].filter(Boolean).join('');
}

function getExistingFieldValueSchema({ definition }: { definition: ScannerPropertyDefinition }) {
  const description = describeDefinition({ definition });
  const optionNames = definition.options.map(option => option.name) as [string, ...string[]];

  switch (definition.type) {
    case CUSTOM_PROPERTY_TYPES.NUMBER:
      return z.number().nullable().describe(`${description} (number)`);
    case CUSTOM_PROPERTY_TYPES.BOOLEAN:
      return z.boolean().nullable().describe(`${description} (yes / no)`);
    case CUSTOM_PROPERTY_TYPES.DATE:
      return z.string().nullable().describe(`${description} (date as YYYY-MM-DD)`);
    case CUSTOM_PROPERTY_TYPES.SELECT:
      return optionNames.length === 0 ? null : z.enum(optionNames).nullable().describe(`${description} (one of its options)`);
    case CUSTOM_PROPERTY_TYPES.MULTI_SELECT:
      return optionNames.length === 0 ? null : z.array(z.enum(optionNames)).nullable().describe(`${description} (some of its options)`);
    case CUSTOM_PROPERTY_TYPES.TEXT:
      return z.string().nullable().describe(`${description} (text)`);
    case CUSTOM_PROPERTY_TYPES.USER_RELATION:
    case CUSTOM_PROPERTY_TYPES.DOCUMENT_RELATION:
      return null;
  }
}

// The fields the model can fill, each with the schema of its value; relation types cannot be read from a catalog
export function getFillableDefinitions({ definitions }: { definitions: ScannerPropertyDefinition[] }) {
  return definitions
    .map(definition => ({ definition, valueSchema: getExistingFieldValueSchema({ definition }) }))
    .filter((entry): entry is { definition: ScannerPropertyDefinition; valueSchema: NonNullable<typeof entry.valueSchema> } => entry.valueSchema !== null)
    .map((entry, index) => ({ ...entry, slot: getExistingFieldSlot({ index }) }));
}

// What the model answers, built for each scan from the fields and products the organization already has:
// existing fields are typed slots and existing products an enum, so it can only point at what really exists
export function buildCatalogReadingSchema({ definitions, existingProducts }: { definitions: ScannerPropertyDefinition[]; existingProducts: ScannerExistingProduct[] }) {
  const fillable = getFillableDefinitions({ definitions });
  const existingProductIds = existingProducts.map(product => product.id) as [string, ...string[]];

  return z.object({
    newFields: z.array(z.object({
      name: z.string().describe('Short name in the language of the catalog, e.g. "Color de tela", "Gramaje"'),
      type: z.enum(NEW_FIELD_TYPES).describe('text, number (a measure without its unit, put the unit in the name: "Peso (kg)") or boolean'),
      description: z.string().describe('One sentence saying what it holds'),
    })).describe('Characteristics printed for the products that NO existing field covers. Leave empty when existing fields cover everything. Never declare a field that means the same as an existing one, even with other words'),
    products: z.array(z.object({
      ...(existingProducts.length > 0
        ? { matchesProductId: z.enum(existingProductIds).nullable().describe('The id of the existing product of this supplier it is (same product, maybe with a new price), null for a new product') }
        : {}),
      name: z.string(),
      description: z.string().nullable().describe('Short description as printed, null when none'),
      reference: z.string().nullable().describe('Supplier reference, SKU or code, null when none'),
      unit: z.string().describe('Sale unit: unit, kg, m, m2, l, box, hour... "unit" when not printed'),
      unitPrice: z.number().describe('Price per unit before VAT, decimals in the catalog currency, 0 when not printed'),
      currency: z.string().describe('ISO 4217 currency code, e.g. EUR'),
      taxRatePercent: z.number().nullable().describe('VAT rate in percent when printed, null otherwise'),
      ...(fillable.length > 0
        ? { existingFields: z.object(Object.fromEntries(fillable.map(({ slot, valueSchema }) => [slot, valueSchema]))).describe('Values of the existing fields, null when the catalog does not say') }
        : {}),
      newFieldValues: z.array(z.object({
        field: z.string().describe('The exact name of one of the newFields'),
        value: z.string().describe('The value as printed; for number fields only the number with a dot as decimal separator, for boolean fields "true" or "false"'),
      })),
    })),
    warnings: z.array(z.string()).describe('Short notes for the reviewer: unreadable parts, prices that are unclear, products cut off. Empty when everything is clear'),
  });
}

export type CatalogReading = {
  newFields: { name: string; type: typeof NEW_FIELD_TYPES[number]; description: string }[];
  products: {
    matchesProductId?: string | null;
    name: string;
    description: string | null;
    reference: string | null;
    unit: string;
    unitPrice: number;
    currency: string;
    taxRatePercent: number | null;
    existingFields?: Record<string, unknown>;
    newFieldValues: { field: string; value: string }[];
  }[];
  warnings: string[];
};

export function getCatalogReadingInstructions({ definitions, existingProducts }: { definitions: ScannerPropertyDefinition[]; existingProducts: ScannerExistingProduct[] }) {
  const fillable = getFillableDefinitions({ definitions });

  return [
    'You read product catalogs and price lists sent by a supplier (PDF, spreadsheets, scanned or photographed pages) for a small business app.',
    'List every product with its price. Extract exactly what is printed, never invent values.',
    'The organization already has these product fields, each one is a slot of existingFields:',
    fillable.length === 0
      ? '(none yet)'
      : fillable.map(({ slot, definition }) => `- ${slot}: "${definition.name}" (${definition.type})${isNonEmpty(definition.description) ? ` - ${definition.description}` : ''}${definition.options.length > 0 ? ` - options: ${definition.options.map(option => option.name).join(', ')}` : ''}`).join('\n'),
    'Always put a characteristic in the existing field that holds it, even when the catalog names it differently (a "Tejido color" goes to an existing "Color de tela").',
    'Declare a new field only for a characteristic that no existing field can hold, once, and use it for every product that has it.',
    'Price, VAT, unit, reference and description have their own fields: never declare custom fields for them.',
    existingProducts.length === 0
      ? undefined
      : `This supplier already has these products, set matchesProductId when a product of the catalog is one of them:\n${existingProducts.map(product => `- ${product.id}: ${product.name}`).join('\n')}`,
  ].filter(Boolean).join('\n\n');
}

export type ScanField = {
  /** The definition id for an existing field, "new:<key>" for a field to create */
  ref: string;
  status: 'existing' | 'new';
  name: string;
  type: CustomPropertyType;
  description: string | null;
  options: { id: string; name: string }[];
};

export type ScanProduct = {
  matchesProductId: string | null;
  name: string;
  description: string | null;
  unit: string;
  unitPriceMinor: number;
  currency: string;
  taxRateBps: number | null;
  /** Field ref to value, in the shape the custom property expects (option ids for selects) */
  values: Record<string, unknown>;
};

function toNewFieldRef({ key }: { key: string }) {
  return `${NEW_FIELD_REF_PREFIX}${key}`;
}

function parseNewFieldValue({ type, value }: { type: CustomPropertyType; value: string }) {
  const trimmed = value.trim();

  if (trimmed === '') {
    return undefined;
  }

  if (type === CUSTOM_PROPERTY_TYPES.NUMBER) {
    const number = Number(trimmed);
    return Number.isFinite(number) ? number : undefined;
  }

  if (type === CUSTOM_PROPERTY_TYPES.BOOLEAN) {
    return trimmed === 'true' ? true : trimmed === 'false' ? false : undefined;
  }

  return trimmed;
}

function toExistingFieldValue({ definition, value }: { definition: ScannerPropertyDefinition; value: unknown }) {
  if (value === null || value === undefined || value === '') {
    return undefined;
  }

  const optionIdByName = new Map(definition.options.map(option => [option.name, option.id]));

  if (definition.type === CUSTOM_PROPERTY_TYPES.SELECT) {
    return optionIdByName.get(String(value));
  }

  if (definition.type === CUSTOM_PROPERTY_TYPES.MULTI_SELECT) {
    const ids = (Array.isArray(value) ? value : []).map(name => optionIdByName.get(String(name))).filter(id => id !== undefined);
    return ids.length === 0 ? undefined : ids;
  }

  return value;
}

// Turns the model answer into the proposal the user reviews. A new field is identified by the key the database
// derives from its name (the one that has to be unique): a new field whose key is already taken is the existing
// field, and the same new field declared twice is one field.
export function toScanProposal({ reading, definitions, existingProducts }: { reading: CatalogReading; definitions: ScannerPropertyDefinition[]; existingProducts: ScannerExistingProduct[] }) {
  const fillable = getFillableDefinitions({ definitions });
  const definitionsByKey = new Map(definitions.map(definition => [definition.key, definition]));
  const existingProductIds = new Set(existingProducts.map(product => product.id));
  const usedRefs = new Set<string>();

  const newFieldsByKey = new Map<string, ScanField>();
  // The name the model used for a new field, to the ref its values go to
  const refByNewFieldName = new Map<string, string>();

  for (const newField of reading.newFields) {
    const name = newField.name.trim();
    const key = generatePropertyKey({ name });

    if (key === '') {
      continue;
    }

    const existing = definitionsByKey.get(key);

    if (existing) {
      if (existing.type === newField.type) {
        refByNewFieldName.set(name, existing.id);
      }
      continue;
    }

    refByNewFieldName.set(name, toNewFieldRef({ key }));

    if (!newFieldsByKey.has(key)) {
      newFieldsByKey.set(key, { ref: toNewFieldRef({ key }), status: 'new', name, type: newField.type, description: newField.description.trim() || null, options: [] });
    }
  }

  const fieldTypeByRef = new Map<string, CustomPropertyType>([
    ...definitions.map(definition => [definition.id, definition.type] as const),
    ...[...newFieldsByKey.values()].map(field => [field.ref, field.type] as const),
  ]);

  const products: ScanProduct[] = reading.products
    .filter(product => product.name.trim() !== '')
    .map((product) => {
      const values: Record<string, unknown> = {};

      for (const { slot, definition } of fillable) {
        const value = toExistingFieldValue({ definition, value: product.existingFields?.[slot] });

        if (value !== undefined) {
          values[definition.id] = value;
        }
      }

      for (const { field, value } of product.newFieldValues) {
        const ref = refByNewFieldName.get(field.trim());
        const type = ref === undefined ? undefined : fieldTypeByRef.get(ref);
        const parsed = type === undefined ? undefined : parseNewFieldValue({ type, value });

        if (ref !== undefined && parsed !== undefined && values[ref] === undefined) {
          values[ref] = parsed;
        }
      }

      Object.keys(values).forEach(ref => usedRefs.add(ref));

      const description = [isNonEmpty(product.reference) ? `Ref. ${product.reference.trim()}` : undefined, isNonEmpty(product.description) ? product.description.trim() : undefined].filter(Boolean).join(' · ');

      return {
        matchesProductId: isNonEmpty(product.matchesProductId) && existingProductIds.has(product.matchesProductId) ? product.matchesProductId : null,
        name: product.name.trim(),
        description: description === '' ? null : description,
        unit: product.unit.trim() || 'unit',
        unitPriceMinor: Math.max(0, Math.round(product.unitPrice * 100)),
        currency: /^[A-Z]{3}$/i.test(product.currency.trim()) ? product.currency.trim().toUpperCase() : 'EUR',
        taxRateBps: product.taxRatePercent === null ? null : Math.round(product.taxRatePercent * 100),
        values,
      };
    });

  // Only the fields some product has a value for: the existing ones to show them, the new ones to create them
  const fields: ScanField[] = [
    ...definitions
      .filter(definition => usedRefs.has(definition.id))
      .map(definition => ({ ref: definition.id, status: 'existing' as const, name: definition.name, type: definition.type, description: definition.description, options: definition.options.map(({ id, name }) => ({ id, name })) })),
    ...[...newFieldsByKey.values()].filter(field => usedRefs.has(field.ref)),
  ];

  return { fields, products, warnings: reading.warnings };
}

// What the user confirms after the review: the new fields to create (or to map to an existing field instead)
// and the products to save, their values keyed by field ref
export const productCatalogImportSchema = z.object({
  newFields: z.array(z.object({
    ref: z.string().startsWith(NEW_FIELD_REF_PREFIX).max(200),
    name: z.string().trim().min(1).max(100),
    type: z.enum(NEW_FIELD_TYPES),
    description: z.string().trim().max(500).nullable().optional(),
    /** Set when the user chose to store it in an existing field instead of creating a new one */
    existingPropertyDefinitionId: z.string().trim().min(1).max(64).nullable().optional(),
  })).max(50),
  products: z.array(z.object({
    matchesProductId: z.string().trim().min(1).max(64).nullable(),
    name: z.string().trim().min(1).max(200),
    description: z.string().trim().max(1_000).nullable(),
    unit: z.string().trim().min(1).max(40),
    unitPriceMinor: z.number().int().min(0).max(1_000_000_000),
    currency: z.string().trim().length(3).transform(value => value.toUpperCase()),
    taxRateBps: z.number().int().min(0).max(10_000).nullable(),
    values: z.record(z.string().max(200), z.unknown()),
  })).min(1).max(500),
});

export type ProductCatalogImport = z.infer<typeof productCatalogImportSchema>;

export function toEntityCustomProperties({ values, definitionIdByRef }: { values: Record<string, unknown>; definitionIdByRef: Map<string, string> }) {
  return Object.fromEntries(
    Object.entries(values)
      .map(([ref, value]) => [definitionIdByRef.get(ref), value] as const)
      .filter((entry): entry is [string, unknown] => entry[0] !== undefined),
  );
}
