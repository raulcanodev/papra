// Draws "Paqui", the Paqui pixel-art mascot, and writes the logo and every favicon size.
// Run with: pnpm script:generate-brand-assets
import { Buffer } from 'node:buffer';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import zlib from 'node:zlib';

const publicDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../public');

const PALETTE: Record<string, string> = {
  H: '#F6C945', // hair
  h: '#D9A21B', // hair shade
  S: '#F9D5B4', // skin
  s: '#E8B48D', // skin shade
  E: '#2D2A32', // eyes
  L: '#D8574F', // lips
  B: '#F4A596', // blush
  C: '#0F766E', // top
  c: '#0B5C56', // top shade
  Y: '#FBE08A', // hair highlight
};

// 16 x 16, one string per row. Spaces are transparent.
const SPRITE = [
  '                ',
  '    hHHHHHHh    ',
  '   HYYHHHHHHH   ',
  '  HHYHHHHHHhHH  ',
  '  HHHHHHHHSSHH  ',
  ' HHHHHSSSSSSHhH ',
  ' HHHHSSSSSSSSHH ',
  ' HHHHSESSSSESHH ',
  ' HHHHSBSSSSBSHH ',
  ' HHHHSSSLLSSSHH ',
  ' HHHHHSSSSSSHhH ',
  ' HhHHHHSssSHHhH ',
  ' HHHHCCSSSSCCHH ',
  ' HHHCCCCSSCCCCH ',
  '  HCCCCCcCCCCH  ',
  ' CCCCCCCCCCCCCC ',
];

const GRID = 16;

for (const [index, row] of SPRITE.entries()) {
  if (row.length !== GRID) {
    throw new Error(`Sprite row ${index} is ${row.length} wide, expected ${GRID}`);
  }
}

const pixelAt = (x: number, y: number) => PALETTE[SPRITE[y]?.[x] ?? ' '] ?? null;

function hexToRgb(hex: string) {
  return [1, 3, 5].map(i => Number.parseInt(hex.slice(i, i + 2), 16)) as [number, number, number];
}

function buildSvg() {
  const rects: string[] = [];

  // Merge horizontal runs of one color to keep the file tiny
  for (let y = 0; y < GRID; y++) {
    let x = 0;
    while (x < GRID) {
      const color = pixelAt(x, y);
      if (!color) {
        x++;
        continue;
      }
      let end = x;
      while (end + 1 < GRID && pixelAt(end + 1, y) === color) {
        end++;
      }
      rects.push(`<rect x="${x}" y="${y}" width="${end - x + 1}" height="1" fill="${color}"/>`);
      x = end + 1;
    }
  }

  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${GRID} ${GRID}" shape-rendering="crispEdges"><title>Paqui</title>${rects.join('')}</svg>\n`;
}

const crcTable = Array.from({ length: 256 }, (_, n) => {
  let c = n;
  for (let k = 0; k < 8; k++) {
    c = c & 1 ? 0xEDB88320 ^ (c >>> 1) : c >>> 1;
  }
  return c >>> 0;
});

function crc32(buffer: Buffer) {
  let crc = 0xFFFFFFFF;
  for (const byte of buffer) {
    crc = crcTable[(crc ^ byte) & 0xFF]! ^ (crc >>> 8);
  }
  return (crc ^ 0xFFFFFFFF) >>> 0;
}

function chunk(type: string, data: Buffer) {
  const length = Buffer.alloc(4);
  length.writeUInt32BE(data.length);
  const body = Buffer.concat([Buffer.from(type, 'ascii'), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(body));
  return Buffer.concat([length, body, crc]);
}

/** Renders the sprite on a `size` square, optionally over a solid background, with whole-pixel scaling so edges stay sharp. */
function renderPng({ size, background, fill = 1 }: { size: number; background?: string; fill?: number }) {
  const scale = Math.max(1, Math.floor(size * fill / GRID));
  const offset = Math.floor((size - scale * GRID) / 2);
  const bg = background ? hexToRgb(background) : null;
  const raw = Buffer.alloc(size * (size * 4 + 1));

  for (let y = 0; y < size; y++) {
    raw[y * (size * 4 + 1)] = 0;
    for (let x = 0; x < size; x++) {
      const gx = Math.floor((x - offset) / scale);
      const gy = Math.floor((y - offset) / scale);
      const inside = x >= offset && y >= offset && gx >= 0 && gy >= 0 && gx < GRID && gy < GRID;
      const color = inside ? pixelAt(gx, gy) : null;
      const [r, g, b] = color ? hexToRgb(color) : (bg ?? [0, 0, 0]);
      const alpha = color || bg ? 255 : 0;
      const at = y * (size * 4 + 1) + 1 + x * 4;
      raw[at] = r;
      raw[at + 1] = g;
      raw[at + 2] = b;
      raw[at + 3] = alpha;
    }
  }

  const header = Buffer.alloc(13);
  header.writeUInt32BE(size, 0);
  header.writeUInt32BE(size, 4);
  header[8] = 8; // bit depth
  header[9] = 6; // RGBA

  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A]),
    chunk('IHDR', header),
    chunk('IDAT', zlib.deflateSync(raw, { level: 9 })),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

function buildIco(sizes: number[]) {
  const images = sizes.map(size => renderPng({ size }));
  const header = Buffer.alloc(6);
  header.writeUInt16LE(1, 2);
  header.writeUInt16LE(images.length, 4);
  let offset = 6 + images.length * 16;
  const entries = images.map((image, i) => {
    const entry = Buffer.alloc(16);
    entry[0] = sizes[i]! % 256;
    entry[1] = sizes[i]! % 256;
    entry.writeUInt16LE(1, 4);
    entry.writeUInt16LE(32, 6);
    entry.writeUInt32LE(image.length, 8);
    entry.writeUInt32LE(offset, 12);
    offset += image.length;
    return entry;
  });
  return Buffer.concat([header, ...entries, ...images]);
}

const CREAM = '#FFF3D6';
function write(name: string, data: string | Buffer) {
  fs.writeFileSync(path.join(publicDir, name), data);
  console.log(`wrote public/${name}`);
}

write('logo.svg', buildSvg());
write('favicon.svg', buildSvg());
write('favicon.ico', buildIco([16, 32, 48]));

for (const size of [16, 32, 96]) {
  write(`favicon-${size}x${size}.png`, renderPng({ size }));
}
for (const size of [36, 48, 72, 96, 144, 192]) {
  write(`android-icon-${size}x${size}.png`, renderPng({ size }));
}
// iOS flattens transparency to black, so Apple icons get a solid background
for (const size of [57, 60, 72, 76, 114, 120, 144, 152, 180]) {
  write(`apple-icon-${size}x${size}.png`, renderPng({ size, background: CREAM, fill: 0.78 }));
}
write('apple-icon.png', renderPng({ size: 180, background: CREAM, fill: 0.78 }));
write('apple-icon-precomposed.png', renderPng({ size: 180, background: CREAM, fill: 0.78 }));
write('apple-touch-icon.png', renderPng({ size: 180, background: CREAM, fill: 0.78 }));
for (const size of [70, 144, 150, 310]) {
  write(`ms-icon-${size}x${size}.png`, renderPng({ size, background: CREAM, fill: 0.78 }));
}
// Maskable icons keep the art inside the safe zone
for (const size of [192, 512]) {
  write(`web-app-manifest-${size}x${size}.png`, renderPng({ size, background: CREAM, fill: 0.62 }));
}
