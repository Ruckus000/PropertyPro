#!/usr/bin/env tsx
/**
 * Help media capture — local-only tooling (never CI).
 *
 * Usage:
 *   pnpm dev                       # dev server on :3000 with seeded demo data
 *   pnpm help:capture compliance/reviewing-the-compliance-dashboard
 *   pnpm help:capture --all
 *
 * Stills:  full-page or element-clipped PNG → sharp → <name>.webp (1x, viewport
 *          width) + <name>@2x.webp (deviceScaleFactor 2 capture).
 * Clips:   context.recordVideo while actions run → ffmpeg → <name>.mp4
 *          (H.264, faststart, scaled to viewport width, capped fps 24)
 *          + <name>-poster.webp from the first frame.
 * Output:  apps/web/public/help/<category>/<slug>/
 * Budgets: enforced by guard:help-content; this script warns when exceeded.
 *
 * Requires: dev server running, ffmpeg on PATH (brew install ffmpeg),
 *           `pnpm playwright:install` done once.
 */
import { execFileSync } from 'node:child_process';
import {
  mkdirSync,
  readdirSync,
  readFileSync,
  rmSync,
  statSync,
} from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium, type BrowserContext, type Page } from 'playwright';
import sharp from 'sharp';
import {
  captureManifestSchema,
  type CaptureManifest,
  type CaptureShot,
} from './manifest-schema.js';

const scriptDir = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(scriptDir, '..', '..');
const manifestsRoot = join(scriptDir, 'manifests');
const outputRoot = join(repoRoot, 'apps', 'web', 'public', 'help');
const BASE_URL = process.env.HELP_CAPTURE_BASE_URL ?? 'http://localhost:3000';

function loadManifests(filterArg: string | undefined): CaptureManifest[] {
  const manifests: CaptureManifest[] = [];
  for (const category of readdirSync(manifestsRoot, { withFileTypes: true })) {
    if (!category.isDirectory()) continue;
    for (const file of readdirSync(join(manifestsRoot, category.name))) {
      if (!file.endsWith('.json')) continue;
      const raw = JSON.parse(
        readFileSync(join(manifestsRoot, category.name, file), 'utf8'),
      );
      const manifest = captureManifestSchema.parse(raw);
      const id = `${manifest.category}/${manifest.slug}`;
      if (!filterArg || filterArg === '--all' || filterArg === id)
        manifests.push(manifest);
    }
  }
  return manifests;
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
    else if (action.type === 'waitFor')
      await page.waitForSelector(action.selector);
    else if (action.type === 'wait') await page.waitForTimeout(action.ms);
    else if (action.type === 'scrollTo') {
      await page.locator(action.selector).scrollIntoViewIfNeeded();
    }
  }
}

async function captureStill(
  context: BrowserContext,
  shot: CaptureShot,
  outDir: string,
  viewport: { width: number; height: number },
): Promise<void> {
  const page = await context.newPage();
  await login(page, shot.role);
  await page.goto(`${BASE_URL}${shot.route}`);
  await page.waitForLoadState('networkidle');
  await runActions(page, shot);
  await hideDevChrome(page);

  const pngPath = join(outDir, `${shot.name}.tmp.png`);
  if (shot.clipTo) await page.locator(shot.clipTo).screenshot({ path: pngPath });
  else await page.screenshot({ path: pngPath });

  // The context captures at deviceScaleFactor 2, so the PNG is 2x pixels.
  // Emit it as @2x, then downscale to half width for the 1x source.
  const { width: pixelWidth } = await sharp(pngPath).metadata();
  await sharp(pngPath)
    .webp({ quality: 88 })
    .toFile(join(outDir, `${shot.name}@2x.webp`));
  await sharp(pngPath)
    .resize({ width: Math.round((pixelWidth ?? viewport.width * 2) / 2) })
    .webp({ quality: 88 })
    .toFile(join(outDir, `${shot.name}.webp`));
  rmSync(pngPath);
  await page.close();
}

async function captureClip(
  shot: CaptureShot,
  outDir: string,
  viewport: { width: number; height: number },
): Promise<void> {
  const browser = await chromium.launch();
  const videoDir = join(outDir, '.video-tmp');
  mkdirSync(videoDir, { recursive: true });
  const context = await browser.newContext({
    viewport,
    deviceScaleFactor: 2,
    recordVideo: { dir: videoDir, size: viewport },
  });
  const page = await context.newPage();
  await login(page, shot.role);
  await page.goto(`${BASE_URL}${shot.route}`);
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
      'No manifests matched. Usage: pnpm help:capture <category>/<slug> | --all',
    );
    process.exit(1);
  }
  // Per-shot resilience: one bad shot (e.g. a stale action selector) must not
  // abort the whole run. Failures are collected and reported at the end with a
  // non-zero exit, so the operator sees exactly which shots need attention
  // while still keeping every shot that captured cleanly.
  const failures: Array<{ shot: string; error: string }> = [];
  for (const manifest of manifests) {
    const outDir = join(outputRoot, manifest.category, manifest.slug);
    mkdirSync(outDir, { recursive: true });
    console.log(
      `Capturing ${manifest.category}/${manifest.slug} (${manifest.shots.length} shots)…`,
    );
    const browser = await chromium.launch();
    const context = await browser.newContext({
      viewport: manifest.viewport,
      deviceScaleFactor: 2,
    });
    for (const shot of manifest.shots) {
      const label = `${manifest.category}/${manifest.slug}:${shot.name}`;
      try {
        if (shot.kind === 'still')
          await captureStill(context, shot, outDir, manifest.viewport);
        else await captureClip(shot, outDir, manifest.viewport);
        console.log(`  ✓ ${shot.name}`);
      } catch (err) {
        const message = err instanceof Error ? err.message.split('\n')[0]! : String(err);
        console.warn(`  ✗ ${shot.name} — ${message}`);
        failures.push({ shot: label, error: message });
      }
    }
    await context.close();
    await browser.close();
  }

  if (failures.length > 0) {
    console.error(`\n${failures.length} shot(s) failed:`);
    for (const f of failures) console.error(`  • ${f.shot} — ${f.error}`);
    process.exit(1);
  }
}

void main();
