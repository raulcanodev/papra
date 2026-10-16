import type { Database } from '../app/database/database.types';
import type { DocumentsRepository } from '../documents/documents.repository';
import type { OrganizationsRepository } from '../organizations/organizations.repository';
import type { GenericCustomPropertyEntityType } from './custom-properties.constants';
import type { CustomPropertiesRepository, EntityCustomPropertyValueRow } from './custom-properties.repository';
import type { DocumentCustomPropertyValueWithRelatedInfo } from './definitions/custom-property-definition.models';
import type { CustomPropertiesOptionsRepository } from './options/custom-properties-options.repository';
import { z } from 'zod';
import { createDocumentsRepository } from '../documents/documents.repository';
import { createOrganizationsRepository } from '../organizations/organizations.repository';
import { createCustomPropertyDefinitionNotFoundError, createCustomPropertyValueInvalidError } from './custom-properties.errors';
import { createCustomPropertiesRepository } from './custom-properties.repository';
import { customPropertyDefinitionIdSchema } from './custom-properties.schemas.legacy';
import { getCustomPropertyTypeDefinition } from './definitions/custom-property-definition.registry';
import { createCustomPropertiesOptionsRepository } from './options/custom-properties-options.repository';

// Map of property definition id to its raw value, a null value clears the property.
// The record size is bounded by the number of definitions an organization can have.
export const entityCustomPropertiesInputSchema = z.record(customPropertyDefinitionIdSchema, z.unknown());

export type EntityCustomPropertiesInput = z.infer<typeof entityCustomPropertiesInputSchema>;

type PreparedEntityCustomPropertyEntries = Parameters<CustomPropertiesRepository['replaceEntityCustomPropertyValues']>[0]['entries'];

// Validates every value against its definition before anything is written, so an invalid value never leaves a half saved entity
export async function prepareEntityCustomPropertyValues({
  organizationId,
  entityTypes,
  input,
  customPropertiesRepository,
  customPropertiesOptionsRepository,
  organizationsRepository,
  documentsRepository,
}: {
  organizationId: string;
  /** The entity types whose properties the entity may carry, one per role for a contact */
  entityTypes: GenericCustomPropertyEntityType[];
  input: EntityCustomPropertiesInput;
  customPropertiesRepository: CustomPropertiesRepository;
  customPropertiesOptionsRepository: CustomPropertiesOptionsRepository;
  organizationsRepository: OrganizationsRepository;
  documentsRepository: DocumentsRepository;
}): Promise<{ entries: PreparedEntityCustomPropertyEntries }> {
  const inputEntries = Object.entries(input);

  if (inputEntries.length === 0) {
    return { entries: [] };
  }

  // One query for all the definitions of the entity types, instead of one per submitted property
  const { propertyDefinitions } = await customPropertiesRepository.getOrganizationPropertyDefinitions({ organizationId, entityTypes });
  const definitionsById = new Map(propertyDefinitions.map(definition => [definition.id, definition]));

  const entries: PreparedEntityCustomPropertyEntries = [];

  for (const [propertyDefinitionId, rawValue] of inputEntries) {
    const definition = definitionsById.get(propertyDefinitionId);

    // Unknown ids, ids of another organization or of another entity type are all rejected the same way
    if (!definition) {
      throw createCustomPropertyDefinitionNotFoundError();
    }

    // The definitions were filtered on these entity types, the cast only narrows the column union
    const entityType = definition.entityType as GenericCustomPropertyEntityType;

    if (rawValue === null || (Array.isArray(rawValue) && rawValue.length === 0) || rawValue === '') {
      entries.push({ entityType, propertyDefinitionId, values: [] });
      continue;
    }

    const customPropertyTypeDefinition = getCustomPropertyTypeDefinition({ type: definition.type });
    const parseResult = customPropertyTypeDefinition.value.inputSchema.safeParse(rawValue);

    if (!parseResult.success) {
      throw createCustomPropertyValueInvalidError();
    }

    await customPropertyTypeDefinition.value.extendInputValidation?.({
      value: parseResult.data,
      customProperty: definition,
      customPropertiesRepository,
      customPropertiesOptionsRepository,
      organizationsRepository,
      documentsRepository,
    });

    const dbValue = customPropertyTypeDefinition.value.toDb({ value: parseResult.data });

    entries.push({ entityType, propertyDefinitionId, values: Array.isArray(dbValue) ? dbValue : [dbValue] });
  }

  return { entries };
}

// Writes the entity and its custom property values atomically
export async function persistEntityWithCustomProperties<T extends { id: string }>({
  db,
  organizationId,
  entries,
  persistEntity,
}: {
  db: Database;
  organizationId: string;
  entries: PreparedEntityCustomPropertyEntries;
  persistEntity: (args: { db: Database }) => Promise<T>;
}) {
  if (entries.length === 0) {
    return persistEntity({ db });
  }

  return db.transaction(async (transaction) => {
    const tx = transaction as unknown as Database;
    const entity = await persistEntity({ db: tx });

    await createCustomPropertiesRepository({ db: tx }).replaceEntityCustomPropertyValues({
      organizationId,
      entityId: entity.id,
      entries,
    });

    return entity;
  });
}

// Entry point for the routes saving an entity along with its custom properties: validates the values first,
// then writes the entity and its values in a single transaction
export async function saveEntityWithCustomProperties<T extends { id: string }>({
  db,
  organizationId,
  entityTypes,
  customProperties,
  persistEntity,
}: {
  db: Database;
  organizationId: string;
  entityTypes: GenericCustomPropertyEntityType[];
  customProperties: EntityCustomPropertiesInput | undefined;
  persistEntity: (args: { db: Database }) => Promise<T>;
}) {
  const { entries } = await prepareEntityCustomPropertyValues({
    organizationId,
    entityTypes,
    input: customProperties ?? {},
    customPropertiesRepository: createCustomPropertiesRepository({ db }),
    customPropertiesOptionsRepository: createCustomPropertiesOptionsRepository({ db }),
    organizationsRepository: createOrganizationsRepository({ db }),
    documentsRepository: createDocumentsRepository({ db }),
  });

  return persistEntityWithCustomProperties({ db, organizationId, entries, persistEntity });
}

export type EntityCustomPropertyForApi = {
  propertyDefinitionId: string;
  key: string;
  name: string;
  type: string;
  value: unknown;
};

function toTypeDefinitionRow(row: EntityCustomPropertyValueRow): DocumentCustomPropertyValueWithRelatedInfo {
  return {
    value: { ...row.value, userId: null, relatedDocumentId: null },
    definition: row.definition,
    option: row.option,
    relatedUser: null,
    relatedDocument: null,
  };
}

export function groupEntityCustomPropertyValues({ rows }: { rows: EntityCustomPropertyValueRow[] }) {
  const rowsByEntityAndDefinition = new Map<string, Map<string, EntityCustomPropertyValueRow[]>>();

  for (const row of rows) {
    const rowsByDefinition = rowsByEntityAndDefinition.get(row.entityId) ?? new Map<string, EntityCustomPropertyValueRow[]>();
    const definitionRows = rowsByDefinition.get(row.definition.id) ?? [];

    definitionRows.push(row);
    rowsByDefinition.set(row.definition.id, definitionRows);
    rowsByEntityAndDefinition.set(row.entityId, rowsByDefinition);
  }

  const customPropertiesByEntityId: Record<string, EntityCustomPropertyForApi[]> = {};

  for (const [entityId, rowsByDefinition] of rowsByEntityAndDefinition) {
    customPropertiesByEntityId[entityId] = [...rowsByDefinition.values()].map((definitionRows) => {
      const { definition } = definitionRows[0]!;
      const customPropertyTypeDefinition = getCustomPropertyTypeDefinition({ type: definition.type });

      return {
        propertyDefinitionId: definition.id,
        key: definition.key,
        name: definition.name,
        type: definition.type,
        value: customPropertyTypeDefinition.value.fromDb({ rows: definitionRows.map(toTypeDefinitionRow) }),
      };
    });
  }

  return { customPropertiesByEntityId };
}

export async function getEntitiesCustomProperties({
  organizationId,
  entityTypes,
  entityIds,
  customPropertiesRepository,
}: {
  organizationId: string;
  entityTypes: GenericCustomPropertyEntityType[];
  entityIds: string[];
  customPropertiesRepository: CustomPropertiesRepository;
}) {
  const { rows } = await customPropertiesRepository.getEntityCustomPropertyValues({ organizationId, entityTypes, entityIds });

  return groupEntityCustomPropertyValues({ rows });
}
