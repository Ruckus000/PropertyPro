#!/usr/bin/env node
/**
 * Render the web app's favicons from `apps/web/public/brand/icon.svg`.
 *
 *   node scripts/generate-web-icons.mjs
 *
 * Outputs (all COMMITTED, for the reason `generate-admin-icons.mjs` gives —
 * sharp is a native binary we keep out of `next build`):
 *   apps/web/public/brand/icon-32.png           32×32 tab icon for browsers without SVG favicons
 *   apps/web/public/brand/apple-touch-icon.png  180×180, full-bleed square (iOS rounds it itself)
 *   apps/web/public/favicon.ico                 16/32/48, for clients that request /favicon.ico blind
 *
 * The root layout declares these in `metadata.icons` rather than through the
 * App Router's file convention (`app/icon.svg`): a file-based icon outranks
 * config metadata, so it would override the favicon a community sets for its
 * public website (`lib/seo/community-metadata.ts`). Config icons are replaced
 * by any child segment that declares its own.
 */
import { readFile, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), '..');
const SOURCE = join(repoRoot, 'apps/web/public/brand/icon.svg');
const BRAND_DIR = join(repoRoot, 'apps/web/public/brand');
const ICO_OUT = join(repoRoot, 'apps/web/public/favicon.ico');

/** The source SVG's viewBox edge, in user units. */
const VIEWBOX = 32;

/** coral-600, the plate `icon.svg` paints; fills the square Apple icon's corners. */
const PLATE = '#C2533A';

function densityFor(pixels) {
  return Math.min(2400, Math.round((pixels / VIEWBOX) * 96));
}

async function render(svg, pixels) {
  return sharp(svg, { density: densityFor(pixels) })
    .resize(pixels, pixels, { fit: 'contain', background: { r: 0, g: 0, b: 0, alpha: 0 } })
    .png()
    .toBuffer();
}

/**
 * An ICO whose entries are PNG streams (valid since Windows Vista and in every
 * current browser): a 6-byte header, a 16-byte directory entry per image, then
 * the PNG bytes.
 */
function packIco(images) {
  const header = Buffer.alloc(6);
  header.writeUInt16LE(0, 0); // reserved
  header.writeUInt16LE(1, 2); // type: icon
  header.writeUInt16LE(images.length, 4);

  const entries = [];
  let offset = 6 + 16 * images.length;
  for (const { size, png } of images) {
    const entry = Buffer.alloc(16);
    entry.writeUInt8(size >= 256 ? 0 : size, 0); // width (0 means 256)
    entry.writeUInt8(size >= 256 ? 0 : size, 1); // height
    entry.writeUInt8(0, 2); // palette colours
    entry.writeUInt8(0, 3); // reserved
    entry.writeUInt16LE(1, 4); // colour planes
    entry.writeUInt16LE(32, 6); // bits per pixel
    entry.writeUInt32LE(png.length, 8);
    entry.writeUInt32LE(offset, 12);
    entries.push(entry);
    offset += png.length;
  }
  return Buffer.concat([header, ...entries, ...images.map((i) => i.png)]);
}

async function main() {
  const svg = await readFile(SOURCE);

  await writeFile(join(BRAND_DIR, 'icon-32.png'), await render(svg, 32));

  // iOS masks the touch icon to its own rounded square and paints transparent
  // pixels black, so the plate has to reach the corners.
  const apple = await sharp({
    create: { width: 180, height: 180, channels: 4, background: PLATE },
  })
    .composite([{ input: await render(svg, 180), top: 0, left: 0 }])
    .png()
    .toBuffer();
  await writeFile(join(BRAND_DIR, 'apple-touch-icon.png'), apple);

  const icoImages = [];
  for (const size of [16, 32, 48]) {
    icoImages.push({ size, png: await render(svg, size) });
  }
  await writeFile(ICO_OUT, packIco(icoImages));

  console.log(`Wrote icon-32.png and apple-touch-icon.png to ${BRAND_DIR}, and ${ICO_OUT}`);
}

await main();
