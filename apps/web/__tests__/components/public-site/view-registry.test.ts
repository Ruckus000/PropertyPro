/**
 * Block view registry.
 *
 * The registry is the canvas's contract with the public site: one
 * presentational component per block type, so the two cannot drift. These
 * tests defend the invariants that make that true — and one that fails only at
 * `next build`, which is the reason this file exists at all.
 */
import { describe, it, expect, vi } from 'vitest';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { BLOCK_TYPES } from '@propertypro/shared';

// The RENDERER registry imports the four async shells, which construct a DB
// client at module scope — that is precisely why the view registry exists. The
// mock lets this file compare the two registries' coverage without a database.
// The view registry itself pulls nothing of the sort; the source-reading tests
// below are what prove that, and `preview-data.test.ts` runs green with
// DATABASE_URL unset.
vi.mock('@/lib/db/public-community-reader', () => ({
  getPublicCommunityScopedReader: vi.fn(),
}));
import {
  blockViewRegistry,
  hasView,
  isDataDrivenBlock,
  BLOCK_VIEW_KINDS,
} from '@/components/public-site/blocks/view-registry';
import { blockRendererRegistry } from '@/components/public-site/blocks/registry';

// The root `pnpm test` runner and a direct `vitest` run inside apps/web have
// different working directories, so a single cwd-relative path passes in one
// and fails in the other. `import.meta.url` is not a file: URL under this
// vitest config, so resolve by trying both roots.
const BLOCKS_DIR = [
  join(process.cwd(), 'src/components/public-site/blocks'),
  join(process.cwd(), 'apps/web/src/components/public-site/blocks'),
].find(existsSync)!;

describe('view registry — coverage', () => {
  it('covers every block type the public renderer registry covers', () => {
    // A type the site can render but the canvas cannot would show as a hole in
    // the preview with no other symptom.
    const rendererTypes = Object.keys(blockRendererRegistry).sort();
    const viewTypes = Object.keys(blockViewRegistry).sort();
    expect(viewTypes).toEqual(rendererTypes);
  });

  it('classifies every registered type as renderer-shaped or view-shaped', () => {
    for (const type of Object.keys(blockViewRegistry)) {
      expect(BLOCK_VIEW_KINDS[type as keyof typeof BLOCK_VIEW_KINDS]).toBeDefined();
    }
  });

  it('marks exactly the four system-of-record types as data-driven', () => {
    const dataDriven = BLOCK_TYPES.filter((t) => hasView(t) && isDataDrivenBlock(t)).sort();
    expect(dataDriven).toEqual(['announcements', 'contact', 'documents', 'meetings']);
  });

  it('treats the authored types as prop-complete', () => {
    for (const type of ['hero', 'text', 'image', 'faq', 'gallery', 'amenities'] as const) {
      expect(isDataDrivenBlock(type)).toBe(false);
    }
  });

  it('reports unknown types as unrenderable rather than throwing', () => {
    expect(hasView('tombstone' as never)).toBe(false);
  });
});

describe('view registry — client-safety invariants', () => {
  // These read source rather than behaviour on purpose. Breaking them produces
  // a build-time failure with no test signal, so a test that reads imports is
  // the only thing that catches it in CI's unit job.

  const viewFiles = [
    'AnnouncementsBlockView.tsx',
    'DocumentsBlockView.tsx',
    'MeetingsBlockView.tsx',
    'ContactBlockView.tsx',
    'HeroBlock.tsx',
    'TextBlock.tsx',
    'ImageBlock.tsx',
    'FaqBlock.tsx',
    'GalleryBlock.tsx',
    'AmenitiesBlock.tsx',
  ];

  it.each(viewFiles)('%s imports no Node built-in', (file) => {
    const src = readFileSync(join(BLOCKS_DIR, file), 'utf8');
    expect(src).not.toMatch(/from\s+['"]node:/);
  });

  it.each(viewFiles)('%s does not reach storage-paths (which pulls node:crypto)', (file) => {
    // storage-paths re-exports buildPublicAssetUrl for server callers, but
    // importing it drags randomUUID in and breaks the client bundle. Its
    // client-safe twin is @/lib/site-assets/public-url.
    const src = readFileSync(join(BLOCKS_DIR, file), 'utf8');
    expect(src).not.toMatch(/site-assets\/storage-paths/);
  });

  it.each(viewFiles)('%s declares no data access', (file) => {
    const src = readFileSync(join(BLOCKS_DIR, file), 'utf8');
    expect(src).not.toMatch(/getPublicCommunityScopedReader\s*\(/);
    expect(src).not.toMatch(/createScopedClient\s*\(/);
  });

  it.each(viewFiles)('%s exports a synchronous component', (file) => {
    // An async server component cannot render inside the client canvas.
    const src = readFileSync(join(BLOCKS_DIR, file), 'utf8');
    expect(src).not.toMatch(/export\s+async\s+function/);
  });

  it('does not import the sanitizer into a view — jsdom must stay server-side', () => {
    const src = readFileSync(join(BLOCKS_DIR, 'AnnouncementsBlockView.tsx'), 'utf8');
    expect(src).not.toMatch(/html-sanitizer/);
  });
});
