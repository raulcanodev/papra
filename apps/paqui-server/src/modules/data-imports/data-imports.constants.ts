export const DATA_IMPORT_ENTITIES = ['contacts', 'products'] as const;

export type DataImportEntity = typeof DATA_IMPORT_ENTITIES[number];

// The fields a column of the file can fill, per entity. The client has the same list to let the user change the mapping.
export const DATA_IMPORT_FIELDS = {
  contacts: ['name', 'taxId', 'email', 'phone', 'addressLine1', 'addressLine2', 'postalCode', 'city', 'region', 'country', 'bankAccount', 'paymentTermsDays', 'notes'],
  products: ['name', 'description', 'unit', 'unitPrice', 'taxRate'],
} as const satisfies Record<DataImportEntity, readonly string[]>;

export type DataImportField<E extends DataImportEntity = DataImportEntity> = typeof DATA_IMPORT_FIELDS[E][number];

export const MAX_DATA_IMPORT_FILE_BYTES = 10 * 1024 * 1024;

// An export of a whole address book or catalog: every row is read by the app, the model only sees a sample
export const MAX_DATA_IMPORT_ROWS = 10_000;
export const MAX_MODEL_SAMPLE_ROWS = 25;
export const MAX_MODEL_COLUMNS = 60;
