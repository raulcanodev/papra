export type CustomPropertyType = 'text' | 'number' | 'date' | 'boolean' | 'select' | 'multi_select' | 'user_relation' | 'document_relation';

export type CustomPropertyEntityType = 'document' | 'transaction' | 'customer' | 'product' | 'sales_representative';

// Entities whose values are edited within their own create / edit form
export type GenericCustomPropertyEntityType = 'customer' | 'product' | 'sales_representative';

export type EntityCustomProperty = {
  propertyDefinitionId: string;
  key: string;
  name: string;
  type: CustomPropertyType;
  value: unknown;
};

// Map of property definition id to its value (option ids for selects), null clears the property
export type EntityCustomPropertiesInput = Record<string, string | number | boolean | string[] | null>;

export type DocumentCustomProperty = {
  key: string;
  name: string;
  type: CustomPropertyType;
  displayOrder: number;
  value: unknown;
};

export type CustomPropertySelectOption = {
  id: string;
  name: string;
  key: string;
  displayOrder: number;
};

export type CustomPropertyDefinition = {
  id: string;
  organizationId: string;
  name: string;
  key: string;
  description?: string | null;
  type: CustomPropertyType;
  entityType: CustomPropertyEntityType;
  displayOrder: number;
  options: CustomPropertySelectOption[];
  createdAt: Date;
  updatedAt: Date;
};
