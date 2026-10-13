import type { ConditionMatchMode } from './tagging-rules.types';

import { boolean, pgTable, text } from 'drizzle-orm/pg-core';
import { organizationsTable } from '../organizations/organizations.table';
import { createPrimaryKeyField, createTimestampColumns } from '../shared/db/columns.helpers';
import { tagsTable } from '../tags/tags.table';
import { TAGGING_RULE_ID_PREFIX } from './tagging-rules.constants';

export const taggingRulesTable = pgTable(
  'tagging_rules',
  {
    ...createPrimaryKeyField({ prefix: TAGGING_RULE_ID_PREFIX }),
    ...createTimestampColumns(),

    organizationId: text('organization_id').notNull().references(() => organizationsTable.id, { onDelete: 'cascade', onUpdate: 'cascade' }),
    name: text('name').notNull(),
    description: text('description'),
    enabled: boolean('enabled').notNull().default(true),
    conditionMatchMode: text('condition_match_mode').notNull().default('all').$type<ConditionMatchMode>(),
  },
);

export const taggingRuleConditionsTable = pgTable(
  'tagging_rule_conditions',
  {
    ...createPrimaryKeyField({ prefix: 'trc' }),
    ...createTimestampColumns(),

    taggingRuleId: text('tagging_rule_id').notNull().references(() => taggingRulesTable.id, { onDelete: 'cascade', onUpdate: 'cascade' }),
    field: text('field').notNull(),
    operator: text('operator').notNull(),
    value: text('value').notNull(),
    isCaseSensitive: boolean('is_case_sensitive').notNull().default(false),
  },
);

export const taggingRuleActionsTable = pgTable(
  'tagging_rule_actions',
  {
    ...createPrimaryKeyField({ prefix: 'tra' }),
    ...createTimestampColumns(),

    taggingRuleId: text('tagging_rule_id').notNull().references(() => taggingRulesTable.id, { onDelete: 'cascade', onUpdate: 'cascade' }),
    tagId: text('tag_id').notNull().references(() => tagsTable.id, { onDelete: 'cascade', onUpdate: 'cascade' }),
  },
);
