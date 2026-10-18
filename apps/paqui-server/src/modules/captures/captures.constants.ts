export const CAPTURE_SESSION_ID_PREFIX = 'cap';

// What the photos are for: the desktop that opened the session knows what to do with them once they arrive
export const CAPTURE_PURPOSES = ['purchase', 'product_image', 'delivery_note'] as const;
export type CapturePurpose = typeof CAPTURE_PURPOSES[number];

// The phone gets a link with a secret token instead of a session: it only allows adding files to this capture, for a short time
export const CAPTURE_TOKEN_LENGTH = 40;
export const CAPTURE_SESSION_TTL_MS = 15 * 60 * 1_000;
export const MAX_CAPTURE_FILES = 20;
export const MAX_CAPTURE_FILE_SIZE_BYTES = 10 * 1024 * 1024;

// The phone sends JPEG photos (it converts and shrinks them before upload), a PDF scan app output is accepted for purchases
export const CAPTURE_MIME_TYPES: Record<CapturePurpose, readonly string[]> = {
  purchase: ['image/jpeg', 'image/png', 'image/webp', 'application/pdf'],
  product_image: ['image/jpeg', 'image/png', 'image/webp'],
  delivery_note: ['image/jpeg', 'image/png', 'image/webp', 'application/pdf'],
};

// One per purpose: a product image is a single photo, a purchase or delivery note capture can bring several papers
export const MAX_CAPTURE_FILES_BY_PURPOSE: Record<CapturePurpose, number> = {
  purchase: MAX_CAPTURE_FILES,
  product_image: 1,
  delivery_note: MAX_CAPTURE_FILES,
};
