// The types of the fields the scanner may create: what a catalog characteristic is, without options to manage
export const NEW_FIELD_TYPES = ['text', 'number', 'boolean'] as const;

// Refs of the fields proposed by a scan that do not exist yet, followed by the key the field will get
export const NEW_FIELD_REF_PREFIX = 'new:';

export const MAX_SCANNED_FILES = 10;

// A catalog is read in one go: bigger than the assistant inline budget, the model gets the whole list
export const MAX_SCANNED_TABLE_ROWS = 600;
export const MAX_SCANNED_TEXT_CHARS = 80_000;
