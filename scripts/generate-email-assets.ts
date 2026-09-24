/**
 * Generates the static assets the "Florida Modern" email templates load from
 * `${EMAIL_ASSET_BASE_URL}` (default https://getpropertypro.com/email), i.e.
 * `apps/web/public/email/`.
 *
 *   pnpm exec tsx scripts/generate-email-assets.ts
 *
 * Why generated rather than committed by hand:
 * - ICONS are Lucide glyphs at the product's own spec (24 viewBox, 2px stroke,
 *   round caps) — the same set NavRail and `marketing-brand.tsx` draw — so the
 *   circle-check in an email is the circle-check in the app. Email clients
 *   strip inline SVG, so each glyph is rasterised once per semantic colour.
 *   The path data below is copied from lucide-react 0.575 (ISC licence).
 * - The LOGOMARK is the house lockup from `marketing-brand.tsx`: ink strokes,
 *   coral lower bar.
 * - PHOTOS are the marketing site's own imagery, re-encoded webp → JPEG
 *   because Outlook desktop (and several webmail clients) cannot show webp.
 * - FONTS are copied from apps/web; only Apple Mail / iOS honour @font-face,
 *   everything else falls back to Georgia / Helvetica by design.
 *
 * Deterministic: re-running produces the same files, so a diff after running
 * it means an input changed.
 */
import { copyFileSync, mkdirSync, statSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';
import { emailTheme } from '../packages/tokens/src/email';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const OUT = join(ROOT, 'apps/web/public/email');
const MARKETING = join(ROOT, 'apps/web/public/marketing/v1');
const FONTS = join(ROOT, 'apps/web/src/app/fonts');

/** Rendered size: 3x the 40px category mark, so it stays crisp on retina. */
const ICON_PX = 120;

const GLYPHS = {
  alert:
    '<circle cx="12" cy="12" r="10"/><line x1="12" x2="12" y1="8" y2="12"/><line x1="12" x2="12.01" y1="16" y2="16"/>',
  warn: '<path d="m21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3"/><path d="M12 9v4"/><path d="M12 17h.01"/>',
  bell: '<path d="M10.268 21a2 2 0 0 0 3.464 0"/><path d="M3.262 15.326A1 1 0 0 0 4 17h16a1 1 0 0 0 .74-1.673C19.41 13.956 18 12.499 18 8A6 6 0 0 0 6 8c0 4.499-1.411 5.956-2.738 7.326"/>',
  calendar:
    '<path d="M8 2v4"/><path d="M16 2v4"/><rect width="18" height="18" x="3" y="4" rx="2"/><path d="M3 10h18"/>',
  check: '<circle cx="12" cy="12" r="10"/><path d="m9 12 2 2 4-4"/>',
  clock: '<circle cx="12" cy="12" r="10"/><path d="M12 6v6l4 2"/>',
  dashboard:
    '<rect width="7" height="9" x="3" y="3" rx="1"/><rect width="7" height="5" x="14" y="3" rx="1"/><rect width="7" height="9" x="14" y="12" rx="1"/><rect width="7" height="5" x="3" y="16" rx="1"/>',
  doc: '<path d="M6 22a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h8a2.4 2.4 0 0 1 1.704.706l3.588 3.588A2.4 2.4 0 0 1 20 8v12a2 2 0 0 1-2 2z"/><path d="M14 2v5a1 1 0 0 0 1 1h5"/><path d="M10 9H8"/><path d="M16 13H8"/><path d="M16 17H8"/>',
  download: '<path d="M12 15V3"/><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><path d="m7 10 5 5 5-5"/>',
  lock: '<rect width="18" height="11" x="3" y="11" rx="2" ry="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/>',
  megaphone:
    '<path d="M11 6a13 13 0 0 0 8.4-2.8A1 1 0 0 1 21 4v12a1 1 0 0 1-1.6.8A13 13 0 0 0 11 14H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2z"/><path d="M6 14a12 12 0 0 0 2.4 7.2 2 2 0 0 0 3.2-2.4A8 8 0 0 1 10 14"/><path d="M8 6v8"/>',
  money: '<rect width="20" height="12" x="2" y="6" rx="2"/><circle cx="12" cy="12" r="2"/><path d="M6 12h.01M18 12h.01"/>',
  pen: '<path d="M13 21h8"/><path d="M21.174 6.812a1 1 0 0 0-3.986-3.987L3.842 16.174a2 2 0 0 0-.5.83l-1.321 4.352a.5.5 0 0 0 .623.622l4.353-1.32a2 2 0 0 0 .83-.497z"/>',
  shield:
    '<path d="M20 13c0 5-3.5 7.5-7.66 8.95a1 1 0 0 1-.67-.01C7.5 20.5 4 18 4 13V6a1 1 0 0 1 1-1c2 0 4.5-1.2 6.24-2.72a1.17 1.17 0 0 1 1.52 0C14.51 3.81 17 5 19 5a1 1 0 0 1 1 1z"/><path d="m9 12 2 2 4-4"/>',
  user: '<path d="M19 21v-2a4 4 0 0 0-4-4H9a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/>',
} as const;

// Read from `emailTheme` rather than copied, so a token change reaches the
// icons on the next run of this script. Icons take each tone's TEXT colour
// (the same ink as the label beside them), not its rule colour.
const COLOURS = {
  coral: emailTheme.coral,
  red: emailTheme.red.text,
  amber: emailTheme.amber.text,
  green: emailTheme.green.text,
  teal: emailTheme.teal.text,
  violet: emailTheme.violet.text,
  slate: emailTheme.meta,
  white: emailTheme.onFill,
} as const;

type Glyph = keyof typeof GLYPHS;
type Colour = keyof typeof COLOURS;

/** Every icon the templates reference. Keep in sync with `EmailIcon` in packages/email/src/components/email-assets.ts. */
const ICONS: ReadonlyArray<readonly [Glyph, Colour]> = [
  ['alert', 'red'],
  ['alert', 'white'],
  ['bell', 'slate'],
  ['calendar', 'coral'],
  ['check', 'green'],
  ['clock', 'amber'],
  ['clock', 'red'],
  ['clock', 'slate'],
  ['dashboard', 'coral'],
  ['doc', 'coral'],
  ['doc', 'slate'],
  ['download', 'amber'],
  ['download', 'slate'],
  ['lock', 'coral'],
  ['lock', 'slate'],
  ['megaphone', 'coral'],
  ['megaphone', 'slate'],
  ['money', 'red'],
  ['money', 'slate'],
  ['pen', 'violet'],
  ['shield', 'coral'],
  ['shield', 'teal'],
  ['user', 'slate'],
  ['user', 'teal'],
  ['warn', 'amber'],
];

function glyphSvg(glyph: Glyph, colour: Colour): string {
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${ICON_PX}" height="${ICON_PX}" viewBox="0 0 24 24" fill="none" stroke="${COLOURS[colour]}" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">${GLYPHS[glyph]}</svg>`;
}

const LOGOMARK_SVG = `<svg xmlns="http://www.w3.org/2000/svg" width="96" height="96" viewBox="0 0 32 32">
  <path d="M4 11.8L16 4.4l12 7.4" fill="none" stroke="#231610" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"/>
  <path d="M6.6 14.9V25.6a2.6 2.6 0 0 0 2.6 2.6h13.6a2.6 2.6 0 0 0 2.6-2.6V14.9" fill="none" stroke="#231610" stroke-width="2.4" stroke-linecap="round"/>
  <rect x="10" y="18.5" width="12" height="2.3" rx="1.15" fill="#231610"/>
  <rect x="10" y="23.1" width="6" height="2.3" rx="1.15" fill="#C2533A"/>
</svg>`;

/** [source in marketing/v1, output name, width, height] — 2x the displayed size. */
const PHOTOS: ReadonlyArray<readonly [string, string, number, number]> = [
  ['close-coast-1440.webp', 'photo-coast.jpg', 1080, 300],
  ['who-condo-1100.webp', 'photo-condo.jpg', 1080, 300],
  ['records-band-1600.webp', 'band-records.jpg', 1200, 240],
];

async function main(): Promise<void> {
  mkdirSync(join(OUT, 'icons'), { recursive: true });
  mkdirSync(join(OUT, 'fonts'), { recursive: true });

  const written: string[] = [];
  const png = { compressionLevel: 9, palette: true } as const;

  for (const [glyph, colour] of ICONS) {
    const file = join(OUT, 'icons', `${glyph}-${colour}.png`);
    await sharp(Buffer.from(glyphSvg(glyph, colour))).png(png).toFile(file);
    written.push(file);
  }

  const logo = join(OUT, 'logomark-ink.png');
  await sharp(Buffer.from(LOGOMARK_SVG)).png(png).toFile(logo);
  written.push(logo);

  for (const [source, name, width, height] of PHOTOS) {
    const file = join(OUT, name);
    await sharp(join(MARKETING, source))
      .resize(width, height, { fit: 'cover', position: 'attention' })
      .jpeg({ quality: 72, mozjpeg: true, progressive: true })
      .toFile(file);
    written.push(file);
  }

  for (const font of ['fraunces-latin-var.woff2', 'inter-latin-var.woff2', 'OFL-Fraunces.txt']) {
    const file = join(OUT, 'fonts', font);
    copyFileSync(join(FONTS, font), file);
    written.push(file);
  }

  let total = 0;
  for (const file of written) {
    const bytes = statSync(file).size;
    total += bytes;
    console.log(`${(bytes / 1024).toFixed(1).padStart(7)} KB  ${file.slice(ROOT.length + 1)}`);
  }
  console.log(`${written.length} files, ${(total / 1024).toFixed(0)} KB total`);
}

main().catch((error: unknown) => {
  console.error(error);
  process.exit(1);
});
