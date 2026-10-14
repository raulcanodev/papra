export const DEMO_IS_SEEDED_KEY = 'demo:is-seeded';

// Bumped whenever the shape of the demo data changes: visitors with an older version get a fresh seed instead of
// records the current mock no longer understands
export const DEMO_DATA_VERSION = '4';

export const DEMO_DEFAULT_PARENT_ORIGINS = 'https://heypaqui.com https://www.heypaqui.com';

// Sent by the landing page to the embedded demo so it follows the visitor's theme and language
export const DEMO_PREFERENCES_MESSAGE_SOURCE = 'paqui-landing';
