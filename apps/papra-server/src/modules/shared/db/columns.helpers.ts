import { text, timestamp } from 'drizzle-orm/pg-core';
import { generateId } from '../random/ids';

export function createPrimaryKeyField({
  prefix,
  idGenerator = () => generateId({ prefix }),
}: { prefix?: string; idGenerator?: () => string } = {}) {
  return {
    id: text('id')
      .primaryKey()
      .$default(idGenerator),
  };
}

export function createCreatedAtField() {
  return {
    createdAt: timestamp('created_at', { mode: 'date', withTimezone: true, precision: 3 })
      .notNull()
      .$default(() => new Date()),
  };
}

export function createUpdatedAtField() {
  return {
    updatedAt: timestamp('updated_at', { mode: 'date', withTimezone: true, precision: 3 })
      .notNull()
      .$default(() => new Date()),
  };
}

export function createTimestampColumns() {
  return {
    ...createCreatedAtField(),
    ...createUpdatedAtField(),
  };
}
