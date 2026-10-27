export const AI_USAGE_ID_PREFIX = 'aiu';

// Every feature that calls a language model. A new AI feature adds its id here: getAiModel requires one,
// and the admin usage page shows it as is
export const AI_FEATURES = {
  ASSISTANT_CHAT: 'assistant_chat',
  PURCHASE_READING: 'purchase_reading',
  DELIVERY_NOTE_READING: 'delivery_note_reading',
  PRODUCT_CATALOG_SCAN: 'product_catalog_scan',
  PRICING_IMPORT: 'pricing_import',
  DATA_IMPORT: 'data_import',
  FINANCE_RULE_SUGGESTIONS: 'finance_rule_suggestions',
  VOICE_DICTATION: 'voice_dictation',
} as const;

export type AiFeature = typeof AI_FEATURES[keyof typeof AI_FEATURES];

export const AI_FEATURES_LIST = Object.values(AI_FEATURES);

export const AI_REASONING_EFFORTS = ['low', 'medium', 'high', 'max'] as const;

export type AiReasoningEffort = typeof AI_REASONING_EFFORTS[number];

export const AI_USAGE_STATUSES = ['success', 'error'] as const;

// The single row of the AI settings table
export const AI_SETTINGS_ID = 'default';

// The model settings are read on every AI call: kept in memory this long, so a change from the admin panel
// reaches every server instance within that delay without a query per call
export const AI_SETTINGS_CACHE_TTL_MS = 30_000;
