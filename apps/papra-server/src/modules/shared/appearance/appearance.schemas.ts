import { z } from 'zod';
import { ENTITY_ICON_COLORS, ENTITY_ICON_MAX_LENGTH } from './appearance.constants';

// An emoji ("🍕") or a curated icon ("icon:building-store"), and the color of its tile.
// Left out (undefined) on an update keeps the stored value: integrations that do not know these fields never wipe them.
export const entityAppearanceSchema = z.object({
  icon: z.string().trim().max(ENTITY_ICON_MAX_LENGTH).optional().nullable().transform(icon => (icon === '' ? null : icon)),
  iconColor: z.enum(ENTITY_ICON_COLORS).optional().nullable(),
});
