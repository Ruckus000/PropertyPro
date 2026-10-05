#!/usr/bin/env tsx
/**
 * Help media capture — local-only tooling (never CI).
 *
 * Usage:
 *   pnpm dev                       # dev server on :3000 with seeded demo data
 *   pnpm help:capture manager/documents/upload-document
 *   pnpm help:capture manager/documents        # every manifest under a prefix
 *   pnpm help:capture --all
 *
 * Stills:  viewport PNG, optionally cropped to `clipTo` (+ `pad`) with the
 *          `highlight` control outlined and numbered `step` — the design's
 *          per-step callout → sharp → <name>.webp (1x) + <name>@2x.webp.
 *          Each still's 1x size and capture date are recorded in media-index.json.
 * Clips:   context.recordVideo while actions run → ffmpeg → <name>.mp4
 *          (H.264, faststart, scaled to viewport width, capped fps 24)
 *          + <name>-poster.webp from the first frame.
 * Output:  apps/web/public/help/<section>/<category>/<slug>/
 * Browser: Playwright's Chromium, or HELP_CAPTURE_CHROMIUM=<path to a binary>.
 * Community ids: `{cid}` in a route resolves by seeded slug through
 *          DATABASE_URL, or HELP_CAPTURE_COMMUNITY_IDS="condo=2,hoa=4,apartment=3".
 * Budgets: enforced by guard:help-content; this script warns when exceeded.
 *
 * Requires: dev server running, ffmpeg on PATH (brew install ffmpeg),
 *           `pnpm playwright:install` done once.
 */
import { execFileSync } from 'node:child_process';
import {
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  rmSync,
  statSync,
  writeFileSync,
} from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium, type BrowserContext, type Page } from 'playwright';
import postgres from 'postgres';
import sharp from 'sharp';
import {
  CAPTURE_COMMUNITIES,
  captureManifestSchema,
  type CaptureManifest,
  type CaptureShot,
} from './manifest-schema.js';
import type { MediaIndexEntry } from '../../apps/web/src/lib/help/media-index';

const scriptDir = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(scriptDir, '..', '..');
const manifestsRoot = join(scriptDir, 'manifests');
const outputRoot = join(repoRoot, 'apps', 'web', 'public', 'help');
const mediaIndexPath = join(repoRoot, 'apps', 'web', 'src', 'content', 'help', 'media-index.json');
/** --color-coral-500 fallback; the page's own --interactive-primary wins. */
const HIGHLIGHT_FALLBACK = '#E8604C'; // design-tokens:exempt — capture overlay fallback

type CommunityKey = keyof typeof CAPTURE_COMMUNITIES;
/** HELP_CAPTURE_CHROMIUM: a Chromium binary to use instead of Playwright's download. */
const LAUNCH_OPTIONS = process.env.HELP_CAPTURE_CHROMIUM
  ? { executablePath: process.env.HELP_CAPTURE_CHROMIUM }
  : {};
const BASE_URL = process.env.HELP_CAPTURE_BASE_URL ?? 'http://localhost:3000';

function manifestId(m: CaptureManifest): string {
  return `${m.section}/${m.category}/${m.slug}`;
}

function listManifestFiles(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const target = join(dir, entry.name);
    if (entry.isDirectory()) return listManifestFiles(target);
    return entry.name.endsWith('.json') ? [target] : [];
  });
}

function loadManifests(filterArg: string | undefined): CaptureManifest[] {
  return listManifestFiles(manifestsRoot)
    .map((file) => captureManifestSchema.parse(JSON.parse(readFileSync(file, 'utf8'))))
    .filter((manifest) => {
      if (!filterArg || filterArg === '--all') return true;
      const id = manifestId(manifest);
      return id === filterArg || id.startsWith(`${filterArg}/`);
    });
}

async function resolveCommunityIds(): Promise<Record<CommunityKey, number>> {
  const override = process.env.HELP_CAPTURE_COMMUNITY_IDS;
  if (override) {
    const ids = Object.fromEntries(
      override.split(',').map((pair) => {
        const [key, value] = pair.split('=');
        return [key!.trim(), Number(value)];
      }),
    ) as Record<CommunityKey, number>;
    for (const key of Object.keys(CAPTURE_COMMUNITIES) as CommunityKey[]) {
      if (!Number.isInteger(ids[key])) throw new Error(`HELP_CAPTURE_COMMUNITY_IDS is missing ${key}=<id>`);
    }
    return ids;
  }
  const url = process.env.DATABASE_URL;
  if (!url) {
    throw new Error('Set DATABASE_URL (local) or HELP_CAPTURE_COMMUNITY_IDS="condo=…,hoa=…,apartment=…"');
  }
  const sql = postgres(url, { max: 1 });
  try {
    const rows = await sql<{ id: number; slug: string }[]>`
      select id, slug from communities where slug in ${sql(Object.values(CAPTURE_COMMUNITIES))}`;
    const bySlug = new Map(rows.map((row) => [row.slug, Number(row.id)]));
    const ids = {} as Record<CommunityKey, number>;
    for (const [key, slug] of Object.entries(CAPTURE_COMMUNITIES) as [CommunityKey, string][]) {
      const id = bySlug.get(slug);
      if (!id) throw new Error(`Seeded community "${slug}" not found — run the demo seed first`);
      ids[key] = id;
    }
    return ids;
  } finally {
    await sql.end();
  }
}

function resolveRoute(shot: CaptureShot, ids: Record<CommunityKey, number>): string {
  return shot.route.replaceAll('{cid}', String(ids[shot.community]));
}

async function login(page: Page, role: string): Promise<void> {
  const res = await page.goto(`${BASE_URL}/dev/agent-login?as=${role}`);
  if (!res || res.status() >= 400) {
    throw new Error(
      `agent-login failed for role "${role}" (is the dev server running at ${BASE_URL}?)`,
    );
  }
  await page.waitForLoadState('networkidle');
}

/**
 * Hide dev-only overlays (the Next.js dev-tools indicator / build-error
 * badge) so they never bleed into production help media. No-op in a real
 * production build where these elements don't exist.
 */
async function hideDevChrome(page: Page): Promise<void> {
  await page
    .addStyleTag({
      content:
        'nextjs-portal,[data-next-badge-root],[data-nextjs-toast],#__next-build-watcher,#__next-dev-tools-indicator{display:none !important}',
    })
    .catch(() => {});
}

async function runActions(page: Page, shot: CaptureShot): Promise<void> {
  for (const action of shot.actions) {
    if (action.type === 'click') await page.click(action.selector);
    else if (action.type === 'fill')
      await page.fill(action.selector, action.value);
    else if (action.type === 'select')
      await page.selectOption(action.selector, action.value);
    else if (action.type === 'waitFor')
      await page.waitForSelector(action.selector);
    else if (action.type === 'wait') await page.waitForTimeout(action.ms);
    else if (action.type === 'scrollTo') {
      await page.locator(action.selector).first().scrollIntoViewIfNeeded();
    } else if (action.type === 'press') await page.keyboard.press(action.key);
  }
}

/**
 * Outline the step's control and pin its number to the corner — the design's
 * per-step callout. Drawn as a fixed overlay so it never shifts page layout.
 */
async function drawHighlight(page: Page, shot: CaptureShot): Promise<void> {
  if (!shot.highlight) return;
  const box = await page.locator(shot.highlight).first().boundingBox();
  if (!box) throw new Error(`highlight target not visible: ${shot.highlight}`);
  await page.evaluate(
    ({ box, step, fallback }) => {
      const color =
        getComputedStyle(document.documentElement).getPropertyValue('--interactive-primary').trim() || fallback;
      const ring = document.createElement('div');
      Object.assign(ring.style, {
        position: 'fixed',
        left: `${box.x - 4}px`,
        top: `${box.y - 4}px`,
        width: `${box.width + 8}px`,
        height: `${box.height + 8}px`,
        border: `2px solid ${color}`,
        borderRadius: '8px',
        pointerEvents: 'none',
        zIndex: '2147483646',
      });
      ring.setAttribute('data-help-capture-overlay', '');
      document.body.appendChild(ring);
      if (step) {
        const badge = document.createElement('div');
        badge.textContent = String(step);
        Object.assign(badge.style, {
          position: 'fixed',
          left: `${box.x - 15}px`,
          top: `${box.y - 15}px`,
          width: '22px',
          height: '22px',
          borderRadius: '9999px',
          background: color,
          color: '#fff',
          font: '600 12px/22px Inter, system-ui, sans-serif',
          textAlign: 'center',
          pointerEvents: 'none',
          zIndex: '2147483647',
        });
        badge.setAttribute('data-help-capture-overlay', '');
        document.body.appendChild(badge);
      }
    },
    { box, step: shot.step ?? null, fallback: HIGHLIGHT_FALLBACK },
  );
}

/** Union of the clip targets' boxes (plus the highlight ring), padded, inside the viewport. */
async function resolveClip(
  page: Page,
  shot: CaptureShot,
  viewport: { width: number; height: number },
): Promise<{ x: number; y: number; width: number; height: number } | undefined> {
  if (!shot.clipTo) return undefined;
  const selectors = [...(Array.isArray(shot.clipTo) ? shot.clipTo : [shot.clipTo])];
  if (shot.highlight) selectors.push(shot.highlight);
  const boxes = [];
  for (const selector of selectors) {
    const box = await page.locator(selector).first().boundingBox();
    if (!box) throw new Error(`clip target not visible: ${selector}`);
    boxes.push(box);
  }
  // The ring and badge sit up to 15px outside the highlight box.
  const pad = Math.max(shot.pad, shot.highlight ? 20 : 0);
  const left = Math.max(0, Math.min(...boxes.map((b) => b.x)) - pad);
  const top = Math.max(0, Math.min(...boxes.map((b) => b.y)) - pad);
  const right = Math.min(viewport.width, Math.max(...boxes.map((b) => b.x + b.width)) + pad);
  const bottom = Math.min(viewport.height, Math.max(...boxes.map((b) => b.y + b.height)) + pad);
  return { x: left, y: top, width: right - left, height: bottom - top };
}

async function captureStill(
  context: BrowserContext,
  shot: CaptureShot,
  route: string,
  outDir: string,
  viewport: { width: number; height: number },
): Promise<MediaIndexEntry> {
  const page = await context.newPage();
  await login(page, shot.role);
  await page.goto(`${BASE_URL}${route}`);
  await page.waitForLoadState('networkidle');
  await runActions(page, shot);
  await hideDevChrome(page);
  await drawHighlight(page, shot);

  const pngPath = join(outDir, `${shot.name}.tmp.png`);
  await page.screenshot({ path: pngPath, clip: await resolveClip(page, shot, viewport) });

  // The context captures at deviceScaleFactor 2, so the PNG is 2x pixels.
  // Emit it as @2x, then downscale to half width for the 1x source.
  const { width: pixelWidth, height: pixelHeight } = await sharp(pngPath).metadata();
  const width = Math.round((pixelWidth ?? viewport.width * 2) / 2);
  const height = Math.round((pixelHeight ?? viewport.height * 2) / 2);
  await sharp(pngPath)
    .webp({ quality: 88 })
    .toFile(join(outDir, `${shot.name}@2x.webp`));
  await sharp(pngPath)
    .resize({ width })
    .webp({ quality: 88 })
    .toFile(join(outDir, `${shot.name}.webp`));
  rmSync(pngPath);
  await page.close();
  return [width, height, new Date().toISOString().slice(0, 10)];
}

function readMediaIndex(): Record<string, MediaIndexEntry> {
  return existsSync(mediaIndexPath) ? JSON.parse(readFileSync(mediaIndexPath, 'utf8')) : {};
}

function writeMediaIndex(index: Record<string, MediaIndexEntry>): void {
  const sorted = Object.fromEntries(Object.entries(index).sort(([a], [b]) => a.localeCompare(b)));
  writeFileSync(mediaIndexPath, `${JSON.stringify(sorted, null, 2)}\n`);
}

async function captureClip(
  shot: CaptureShot,
  route: string,
  outDir: string,
  viewport: { width: number; height: number },
): Promise<void> {
  const browser = await chromium.launch(LAUNCH_OPTIONS);
  const videoDir = join(outDir, '.video-tmp');
  mkdirSync(videoDir, { recursive: true });
  const context = await browser.newContext({
    viewport,
    deviceScaleFactor: 2,
    recordVideo: { dir: videoDir, size: viewport },
  });
  const page = await context.newPage();
  await login(page, shot.role);
  await page.goto(`${BASE_URL}${route}`);
  await page.waitForLoadState('networkidle');
  await runActions(page, shot);
  if (shot.durationMs) await page.waitForTimeout(shot.durationMs);
  await context.close();
  await browser.close();

  const webm = readdirSync(videoDir).find((f) => f.endsWith('.webm'));
  if (!webm) throw new Error(`no video recorded for ${shot.name}`);
  const webmPath = join(videoDir, webm);
  const mp4Path = join(outDir, `${shot.name}.mp4`);
  execFileSync('ffmpeg', [
    '-y',
    '-i',
    webmPath,
    '-vf',
    `scale=${viewport.width}:-2,fps=24`,
    '-c:v',
    'libx264',
    '-preset',
    'slow',
    '-crf',
    '28',
    '-movflags',
    '+faststart',
    '-an',
    mp4Path,
  ]);
  const posterTmp = join(outDir, `${shot.name}-poster.tmp.png`);
  execFileSync('ffmpeg', ['-y', '-i', mp4Path, '-vframes', '1', posterTmp]);
  await sharp(posterTmp)
    .webp({ quality: 80 })
    .toFile(join(outDir, `${shot.name}-poster.webp`));
  rmSync(posterTmp);
  rmSync(videoDir, { recursive: true });

  const size = statSync(mp4Path).size;
  if (size > 1.5 * 1024 * 1024) {
    console.warn(
      `⚠ ${shot.name}.mp4 is ${(size / 1024 / 1024).toFixed(2)}MB — over the 1.5MB budget. Shorten or split the clip.`,
    );
  }
}

async function main(): Promise<void> {
  const manifests = loadManifests(process.argv[2]);
  if (manifests.length === 0) {
    console.error(
      'No manifests matched. Usage: pnpm help:capture <section>[/<category>[/<slug>]] | --all',
    );
    process.exit(1);
  }
  const communityIds = await resolveCommunityIds();
  const mediaIndex = readMediaIndex();
  // Per-shot resilience: one bad shot (e.g. a stale action selector) must not
  // abort the whole run. Failures are collected and reported at the end with a
  // non-zero exit, so the operator sees exactly which shots need attention
  // while still keeping every shot that captured cleanly.
  const failures: Array<{ shot: string; error: string }> = [];
  for (const manifest of manifests) {
    const id = manifestId(manifest);
    const outDir = join(outputRoot, manifest.section, manifest.category, manifest.slug);
    mkdirSync(outDir, { recursive: true });
    console.log(`Capturing ${id} (${manifest.shots.length} shots)…`);
    const browser = await chromium.launch(LAUNCH_OPTIONS);
    const context = await browser.newContext({
      viewport: manifest.viewport,
      deviceScaleFactor: 2,
    });
    for (const shot of manifest.shots) {
      const label = `${id}:${shot.name}`;
      const route = resolveRoute(shot, communityIds);
      try {
        if (shot.kind === 'still') {
          mediaIndex[`${id}/${shot.name}`] = await captureStill(context, shot, route, outDir, manifest.viewport);
        } else await captureClip(shot, route, outDir, manifest.viewport);
        console.log(`  ✓ ${shot.name}`);
      } catch (err) {
        const message = err instanceof Error ? err.message.split('\n')[0]! : String(err);
        console.warn(`  ✗ ${shot.name} — ${message}`);
        failures.push({ shot: label, error: message });
      }
    }
    await context.close();
    await browser.close();
    // Written per manifest so an interrupted --all run keeps what it captured.
    writeMediaIndex(mediaIndex);
  }

  if (failures.length > 0) {
    console.error(`\n${failures.length} shot(s) failed:`);
    for (const f of failures) console.error(`  • ${f.shot} — ${f.error}`);
    process.exit(1);
  }
}

void main();
