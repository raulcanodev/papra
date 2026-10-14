import type { Config } from '../config/config.types';
import type { DocumentsRepository } from '../documents/documents.repository';
import type { OrganizationsRepository } from '../organizations/organizations.repository';
import type { CustomPropertyEntityType } from './custom-properties.constants';
import type { CustomPropertiesRepository } from './custom-properties.repository';
import type { CreatePropertyDefinition } from './definitions/custom-property-definition.registry';
import type { CustomPropertiesOptionsRepository } from './options/custom-properties-options.repository';
import { CUSTOM_PROPERTY_ENTITY_TYPES, CUSTOM_PROPERTY_TYPES_BY_ENTITY_TYPE } from './custom-properties.constants';
import {
  createCustomPropertyDefinitionInvalidUpdateError,
  createCustomPropertyDefinitionNotFoundError,
  createCustomPropertyTypeNotAllowedForEntityError,
  createCustomPropertyValueInvalidError,
  createOrganizationCustomPropertyLimitReachedError,
} from './custom-properties.errors';
import { getCustomPropertyTypeDefinition } from './definitions/custom-property-definition.registry';
import { ensureOptionsExist } from './options/custom-properties-options.usecases';

export async function createPropertyDefinition({
  organizationId,
  definition,
  config,
  customPropertiesRepository,
  customPropertiesOptionsRepository,
}: {
  organizationId: string;
  definition: CreatePropertyDefinition;
  config: Config;
  customPropertiesRepository: CustomPropertiesRepository;
  customPropertiesOptionsRepository: CustomPropertiesOptionsRepository;
}) {
  if (!CUSTOM_PROPERTY_TYPES_BY_ENTITY_TYPE[definition.entityType].includes(definition.type)) {
    throw createCustomPropertyTypeNotAllowedForEntityError();
  }

  const { count } = await customPropertiesRepository.getOrganizationPropertyDefinitionsCount({ organizationId });

  if (count >= config.customProperties.maxCustomPropertiesPerOrganization) {
    throw createOrganizationCustomPropertyLimitReachedError();
  }

  const { propertyDefinition } = await customPropertiesRepository.createPropertyDefinition({
    definition: {
      organizationId,
      name: definition.name,
      description: definition.description,
      displayOrder: definition.displayOrder,
      type: definition.type,
      entityType: definition.entityType,
    },
  });

  const customPropertyTypeDefinition = getCustomPropertyTypeDefinition({ type: propertyDefinition.type });

  await customPropertyTypeDefinition.definition.onCreate?.({
    apiInput: definition,
    propertyDefinition,
    customPropertiesRepository,
    customPropertiesOptionsRepository,
  });

  return { propertyDefinition };
}

export async function updatePropertyDefinition({
  propertyDefinitionId,
  organizationId,
  rawDefinition,
  customPropertiesRepository,
  customPropertiesOptionsRepository,
}: {
  propertyDefinitionId: string;
  organizationId: string;
  rawDefinition: unknown;
  customPropertiesRepository: CustomPropertiesRepository;
  customPropertiesOptionsRepository: CustomPropertiesOptionsRepository;
}) {
  const { definition: existingDefinition } = await ensurePropertyDefinitionExists({ propertyDefinitionId, organizationId, customPropertiesRepository });

  const customPropertyTypeDefinition = getCustomPropertyTypeDefinition({ type: existingDefinition.type });

  const parseResult = customPropertyTypeDefinition.definition.updatePropertySchema.safeParse(rawDefinition);

  if (!parseResult.success) {
    throw createCustomPropertyDefinitionInvalidUpdateError();
  }

  const definition = parseResult.data;

  const { propertyDefinition } = await customPropertiesRepository.updatePropertyDefinition({
    propertyDefinitionId,
    organizationId,
    name: definition.name,
    description: definition.description,
    displayOrder: definition.displayOrder,
  });

  await customPropertyTypeDefinition.definition.onUpdate?.({
    apiInput: definition,
    propertyDefinition,
    customPropertiesRepository,
    customPropertiesOptionsRepository,
  });

  return { propertyDefinition };
}

export async function deletePropertyDefinition({
  propertyDefinitionId,
  organizationId,
  customPropertiesRepository,
}: {
  propertyDefinitionId: string;
  organizationId: string;
  customPropertiesRepository: CustomPropertiesRepository;
}) {
  await ensurePropertyDefinitionExists({ propertyDefinitionId, organizationId, customPropertiesRepository });

  await customPropertiesRepository.deletePropertyDefinition({ propertyDefinitionId, organizationId });
}

export async function setDocumentCustomPropertyValue({
  documentId,
  propertyDefinitionId,
  organizationId,
  value,
  customPropertiesRepository,
  customPropertiesOptionsRepository,
  organizationsRepository,
  documentsRepository,
}: {
  documentId: string;
  propertyDefinitionId: string;
  organizationId: string;
  value: unknown;
  customPropertiesRepository: CustomPropertiesRepository;
  customPropertiesOptionsRepository: CustomPropertiesOptionsRepository;
  organizationsRepository: OrganizationsRepository;
  documentsRepository: DocumentsRepository;
}) {
  const { definition: customProperty } = await ensurePropertyDefinitionExists({ propertyDefinitionId, organizationId, entityType: CUSTOM_PROPERTY_ENTITY_TYPES.DOCUMENT, customPropertiesRepository });

  const customPropertyTypeDefinition = getCustomPropertyTypeDefinition({ type: customProperty.type });

  const parseResult = customPropertyTypeDefinition.value.inputSchema.safeParse(value);

  if (!parseResult.success) {
    throw createCustomPropertyValueInvalidError();
  }

  const parsedValue = parseResult.data;

  await customPropertyTypeDefinition.value.extendInputValidation?.({
    value: parsedValue,
    customProperty,
    customPropertiesRepository,
    customPropertiesOptionsRepository,
    organizationsRepository,
    documentsRepository,
  });

  const dbValue = customPropertyTypeDefinition.value.toDb({ value: parsedValue });

  await customPropertiesRepository.setDocumentCustomPropertyValue({
    documentId,
    propertyDefinitionId,
    values: Array.isArray(dbValue) ? dbValue : [dbValue],
  });
}

export async function deleteDocumentCustomPropertyValue({
  documentId,
  propertyDefinitionId,
  organizationId,
  customPropertiesRepository,
}: {
  documentId: string;
  propertyDefinitionId: string;
  organizationId: string;
  customPropertiesRepository: CustomPropertiesRepository;
}) {
  await ensurePropertyDefinitionExists({ propertyDefinitionId, organizationId, entityType: CUSTOM_PROPERTY_ENTITY_TYPES.DOCUMENT, customPropertiesRepository });

  await customPropertiesRepository.deleteDocumentCustomPropertyValue({ documentId, propertyDefinitionId });
}

export async function ensurePropertyDefinitionExists({
  propertyDefinitionId,
  organizationId,
  entityType,
  customPropertiesRepository,
}: {
  propertyDefinitionId: string;
  organizationId: string;
  // When provided, a definition of another entity type is reported as not found
  entityType?: CustomPropertyEntityType;
  customPropertiesRepository: CustomPropertiesRepository;
}) {
  const { definition } = await customPropertiesRepository.getPropertyDefinitionById({ propertyDefinitionId, organizationId });

  if (!definition || (entityType !== undefined && definition.entityType !== entityType)) {
    throw createCustomPropertyDefinitionNotFoundError();
  }

  return { definition };
}

// Transaction values are written as raw columns, so the definition must be a transaction one of the organization
// and any selected option must belong to that definition (the plain foreign key would accept any option id)
export async function ensureTransactionCustomPropertyValuesAreValid({
  organizationId,
  propertyDefinitionId,
  values,
  customPropertiesRepository,
  customPropertiesOptionsRepository,
}: {
  organizationId: string;
  propertyDefinitionId: string;
  values: { selectOptionId?: string | null; [column: string]: unknown }[];
  customPropertiesRepository: CustomPropertiesRepository;
  customPropertiesOptionsRepository: CustomPropertiesOptionsRepository;
}) {
  const { definition } = await ensurePropertyDefinitionExists({ propertyDefinitionId, organizationId, entityType: CUSTOM_PROPERTY_ENTITY_TYPES.TRANSACTION, customPropertiesRepository });

  const optionIds = values.map(({ selectOptionId }) => selectOptionId).filter((optionId): optionId is string => typeof optionId === 'string');

  if (optionIds.length > 0) {
    await ensureOptionsExist({ propertyDefinitionId, optionIds, customPropertiesOptionsRepository });
  }

  return { definition };
}
