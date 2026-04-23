// @vitest-environment node
import { mkdtemp, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { PDFJS_ASSET_FILES, syncPdfJsAssets } from '../../scripts/sync-pdfjs-assets.mjs';

const tempDirs: string[] = [];

async function makeTempDir(prefix: string): Promise<string> {
  const dir = await mkdtemp(path.join(os.tmpdir(), prefix));
  tempDirs.push(dir);
  return dir;
}

afterEach(async () => {
  await Promise.all(
    tempDirs.splice(0).map(async (dir) => {
      await rm(dir, { recursive: true, force: true });
    }),
  );
});

describe('syncPdfJsAssets', () => {
  it('copies both PDF.js assets and overwrites stale files', async () => {
    const sourceDir = await makeTempDir('pdfjs-source-');
    const destinationDir = await makeTempDir('pdfjs-dest-');

    await mkdir(destinationDir, { recursive: true });

    for (const fileName of PDFJS_ASSET_FILES) {
      await writeFile(path.join(sourceDir, fileName), `fresh:${fileName}`);
      await writeFile(path.join(destinationDir, fileName), `stale:${fileName}`);
    }

    const requireFn = {
      resolve: vi.fn((specifier: string) => {
        const fileName = specifier.replace('pdfjs-dist/build/', '');
        return path.join(sourceDir, fileName);
      }),
    };

    const result = await syncPdfJsAssets({
      destinationDir,
      requireFn,
    });

    expect(requireFn.resolve).toHaveBeenCalledTimes(PDFJS_ASSET_FILES.length);
    expect(result.files.map((file) => file.fileName)).toEqual(PDFJS_ASSET_FILES);

    await Promise.all(
      PDFJS_ASSET_FILES.map(async (fileName) => {
        await expect(readFile(path.join(destinationDir, fileName), 'utf8')).resolves.toBe(`fresh:${fileName}`);
      }),
    );
  });

  it('fails with an actionable message when pdfjs-dist cannot be resolved', async () => {
    const destinationDir = await makeTempDir('pdfjs-dest-fail-');
    const requireFn = {
      resolve: vi.fn(() => {
        throw new Error('module not found');
      }),
    };

    await expect(
      syncPdfJsAssets({
        destinationDir,
        requireFn,
      }),
    ).rejects.toThrow(/Run "pnpm install"/);
  });
});
