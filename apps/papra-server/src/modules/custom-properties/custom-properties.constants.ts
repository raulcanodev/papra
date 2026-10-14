import { createPrefixedIdRegex } from '../shared/random/ids';

export const CUSTOM_PROPERTY_DEFINITION_ID_PREFIX = 'cpd';
export const CUSTOM_PROPERTY_DEFINITION_ID_REGEX = createPrefixedIdRegex({ prefix: CUSTOM_PROPERTY_DEFINITION_ID_PREFIX });

export const DOCUMENT_CUSTOM_PROPERTY_VALUE_ID_PREFIX = 'dcpv';
export const DOCUMENT_CUSTOM_PROPERTY_VALUE_ID_REGEX = createPrefixedIdRegex({ prefix: DOCUMENT_CUSTOM_PROPERTY_VALUE_ID_PREFIX });

export const TRANSACTION_CUSTOM_PROPERTY_VALUE_ID_PREFIX = 'tcpv';
export const TRANSACTION_CUSTOM_PROPERTY_VALUE_ID_REGEX = createPrefixedIdRegex({ prefix: TRANSACTION_CUSTOM_PROPERTY_VALUE_ID_PREFIX });

export const CUSTOM_PROPERTY_TYPES = {
  TEXT: 'text',
  NUMBER: 'number',
  DATE: 'date',
  BOOLEAN: 'boolean',
  SELECT: 'select',
  MULTI_SELECT: 'multi_select',
  USER_RELATION: 'user_relation',
  DOCUMENT_RELATION: 'document_relation',
} as const;

export const CUSTOM_PROPERTY_TYPES_LIST = Object.values(CUSTOM_PROPERTY_TYPES);

export type CustomPropertyType = typeof CUSTOM_PROPERTY_TYPES[keyof typeof CUSTOM_PROPERTY_TYPES];

export const ENTITY_CUSTOM_PROPERTY_VALUE_ID_PREFIX = 'ecpv';

export const CUSTOM_PROPERTY_ENTITY_TYPES = {
  DOCUMENT: 'document',
  TRANSACTION: 'transaction',
  CUSTOMER: 'customer',
  PRODUCT: 'product',
  SALES_REPRESENTATIVE: 'sales_representative',
} as const;

export const CUSTOM_PROPERTY_ENTITY_TYPES_LIST = Object.values(CUSTOM_PROPERTY_ENTITY_TYPES);

export type CustomPropertyEntityType = typeof CUSTOM_PROPERTY_ENTITY_TYPES[keyof typeof CUSTOM_PROPERTY_ENTITY_TYPES];

// Entity types whose values live in the generic entity_custom_property_values table.
// Documents and transactions keep their dedicated value tables (search, relations, legacy data).
export const GENERIC_CUSTOM_PROPERTY_ENTITY_TYPES = [
  CUSTOM_PROPERTY_ENTITY_TYPES.CUSTOMER,
  CUSTOM_PROPERTY_ENTITY_TYPES.PRODUCT,
  CUSTOM_PROPERTY_ENTITY_TYPES.SALES_REPRESENTATIVE,
] as const;

export type GenericCustomPropertyEntityType = typeof GENERIC_CUSTOM_PROPERTY_ENTITY_TYPES[number];

const SCALAR_CUSTOM_PROPERTY_TYPES: CustomPropertyType[] = [
  CUSTOM_PROPERTY_TYPES.TEXT,
  CUSTOM_PROPERTY_TYPES.NUMBER,
  CUSTOM_PROPERTY_TYPES.DATE,
  CUSTOM_PROPERTY_TYPES.BOOLEAN,
  CUSTOM_PROPERTY_TYPES.SELECT,
  CUSTOM_PROPERTY_TYPES.MULTI_SELECT,
];

// Relation types (users, documents) need dedicated columns that only the document values table has
export const CUSTOM_PROPERTY_TYPES_BY_ENTITY_TYPE: Record<CustomPropertyEntityType, CustomPropertyType[]> = {
  [CUSTOM_PROPERTY_ENTITY_TYPES.DOCUMENT]: CUSTOM_PROPERTY_TYPES_LIST,
  [CUSTOM_PROPERTY_ENTITY_TYPES.TRANSACTION]: SCALAR_CUSTOM_PROPERTY_TYPES,
  [CUSTOM_PROPERTY_ENTITY_TYPES.CUSTOMER]: SCALAR_CUSTOM_PROPERTY_TYPES,
  [CUSTOM_PROPERTY_ENTITY_TYPES.PRODUCT]: SCALAR_CUSTOM_PROPERTY_TYPES,
  [CUSTOM_PROPERTY_ENTITY_TYPES.SALES_REPRESENTATIVE]: SCALAR_CUSTOM_PROPERTY_TYPES,
};
