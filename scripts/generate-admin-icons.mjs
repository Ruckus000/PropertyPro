#!/usr/bin/env node
/**
 * Render the operator console's PWA icons from `apps/admin/src/app/icon.svg`.
 *
 *   node scripts/generate-admin-icons.mjs
 *
 * Outputs (all COMMITTED — see below):
 *   apps/admin/public/icons/icon-192.png      192×192, the SVG as drawn
 *   apps/admin/public/icons/icon-512.png      512×512, the SVG as drawn
 *   apps/admin/public/icons/maskable-512.png  512×512, padded for OS masking
 *
 * ## Why the outputs are committed rather than generated at build time
 *
 * `sharp` is a root devDependency with a native binary. Wiring it into
 * `next build` would put a platform-specific compile step in front of every
 * deploy of the admin app to earn three files that change roughly never. Run
 * this by hand when `icon.svg` changes, and commit what it writes.
 *
 * ## Two icons, not one file marked `any maskable`
 *
 * A maskable icon is cropped by the platform to a circle or squircle, and only
 * the inner ~80% is guaranteed to survive. `icon.svg` draws its mark nearly
 * edge to edge, so masking it unpadded clips the glyph. Padding it instead
 * makes it look shrunken everywhere no mask is applied. So: one faithful pair
 * and one padded file, declared separately in `app/manifest.ts`.
 */
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), '..');
const SOURCE = join(repoRoot, 'apps/admin/src/app/icon.svg');
const OUT_DIR = join(repoRoot, 'apps/admin/public/icons');

/** The source SVG's viewBox edge, in user units. */
const VIEWBOX = 32;

/**
 * gray-900 (`packages/tokens/src/primitives.ts`) — the same fill `icon.svg`
 * paints its rounded plate with, so the maskable padding is invisible against
 * the mark rather than a visible border around it.
 */
const PLATE = '#111827';

/**
 * Fraction of the maskable canvas the mark occupies. The safe zone is a circle
 * of 80% diameter; 60% keeps the glyph inside it with room for a squircle's
 * corners, which are tighter than a circle's at the diagonals.
 */
const MASKABLE_CONTENT = 0.6;

/**
 * sharp rasterises an SVG at `density` DPI against a 96dpi CSS reference, THEN
 * resizes. Rasterising a 32-unit viewBox at the default density produces a
 * ~32px bitmap, and resizing that up to 512 is visibly soft — so the density is
 * derived from the target instead. Capped at sharp's 2400 ceiling.
 */
function densityFor(pixels) {
  return Math.min(2400, Math.round((pixels / VIEWBOX) * 96));
}

async function render(svg, pixels) {
  return sharp(svg, { density: densityFor(pixels) })
    .resize(pixels, pixels, { fit: 'contain', background: { r: 0, g: 0, b: 0, alpha: 0 } })
    .png()
    .toBuffer();
}

async function main() {
  const svg = await readFile(SOURCE);
  await mkdir(OUT_DIR, { recursive: true });

  for (const size of [192, 512]) {
    await writeFile(join(OUT_DIR, `icon-${size}.png`), await render(svg, size));
  }

  const canvas = 512;
  const content = Math.round(canvas * MASKABLE_CONTENT);
  const offset = Math.round((canvas - content) / 2);
  const maskable = await sharp({
    create: { width: canvas, height: canvas, channels: 4, background: PLATE },
  })
    .composite([{ input: await render(svg, content), top: offset, left: offset }])
    .png()
    .toBuffer();
  await writeFile(join(OUT_DIR, 'maskable-512.png'), maskable);

  console.log(`Wrote 3 icons to ${OUT_DIR}`);
}

await main();
