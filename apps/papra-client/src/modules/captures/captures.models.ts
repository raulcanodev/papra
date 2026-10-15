import { buildTimeConfig } from '../config/config';

// Plenty for the AI to read the smallest print, light enough to upload over a phone connection
const MAX_PHOTO_SIDE_PX = 2_400;
const PHOTO_JPEG_QUALITY = 0.85;

export function getCaptureUrl({ token, baseUrl = buildTimeConfig.baseUrl }: { token: string; baseUrl?: string }) {
  return `${baseUrl.replace(/\/$/, '')}/capture/${token}`;
}

// A phone cannot open a link to localhost: the QR code would lead nowhere, the computer says so
export function isUnreachableFromPhone({ url }: { url: string }) {
  const { hostname } = new URL(url);

  return hostname === 'localhost' || hostname === '127.0.0.1' || hostname === '[::1]' || hostname.endsWith('.localhost');
}

// Phones and tablets take the photo themselves, computers show the QR code for the phone
export function isTouchDevice() {
  return typeof window !== 'undefined' && window.matchMedia('(pointer: coarse)').matches;
}

export function getScaledSize({ width, height, maxSide = MAX_PHOTO_SIDE_PX }: { width: number; height: number; maxSide?: number }) {
  const scale = Math.min(1, maxSide / Math.max(width, height));

  return { width: Math.round(width * scale), height: Math.round(height * scale) };
}

// Phone photos are large and sometimes HEIC: they are resized and re-encoded as JPEG before upload,
// a PDF (scanner app) or a file the browser cannot decode is sent as is
export async function preparePhotoForUpload({ file }: { file: File }): Promise<File> {
  if (!file.type.startsWith('image/')) {
    return file;
  }

  try {
    const bitmap = await createImageBitmap(file, { imageOrientation: 'from-image' });
    const { width, height } = getScaledSize({ width: bitmap.width, height: bitmap.height });
    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    canvas.getContext('2d')!.drawImage(bitmap, 0, 0, width, height);
    bitmap.close();

    const blob = await new Promise<Blob | null>(resolve => canvas.toBlob(resolve, 'image/jpeg', PHOTO_JPEG_QUALITY));

    if (!blob) {
      return file;
    }

    const name = `${file.name.replace(/\.[^.]+$/, '') || 'photo'}.jpg`;

    return new File([blob], name, { type: 'image/jpeg', lastModified: file.lastModified });
  } catch {
    return file;
  }
}
