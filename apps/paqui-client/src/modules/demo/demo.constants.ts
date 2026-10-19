export const DEMO_IS_SEEDED_KEY = 'demo:is-seeded';

// Bumped whenever the shape of the demo data changes: visitors with an older version get a fresh seed instead of
// records the current mock no longer understands
// Bump whenever the seed changes: every visitor gets the new data on their next visit
export const DEMO_DATA_VERSION = '10';

export const DEMO_DEFAULT_PARENT_ORIGINS = 'https://heypaqui.com https://www.heypaqui.com http://localhost:* http://127.0.0.1:*';

// Sent by the landing page to the embedded demo so it follows the visitor's theme and language
export const DEMO_PREFERENCES_MESSAGE_SOURCE = 'paqui-landing';

// Sent by the embedded demo once it listens: the landing answers with its preferences, which it may have sent too early
export const DEMO_READY_MESSAGE_SOURCE = 'paqui-demo-ready';
