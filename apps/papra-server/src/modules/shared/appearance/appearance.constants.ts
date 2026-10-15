// Notion-like look of catalog entities (contacts, products...): an emoji or a curated icon on a colored tile.
// Mirrors the palette of the client, unknown icons are rendered with the default one so they are not validated here.
export const ENTITY_ICON_COLORS = ['gray', 'black', 'red', 'orange', 'green', 'blue', 'purple'] as const;

export type EntityIconColor = typeof ENTITY_ICON_COLORS[number];

export const ENTITY_ICON_MAX_LENGTH = 64;
