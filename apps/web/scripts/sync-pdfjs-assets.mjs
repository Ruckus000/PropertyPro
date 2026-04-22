import { copyFile, mkdir } from 'node:fs/promises';
import { createRequire } from 'node:module';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

export const PDFJS_ASSET_FILES = ['pdf.mjs', 'pdf.worker.min.mjs'];

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export const WEB_APP_ROOT = path.resolve(__dirname, '..');
export const PDFJS_PUBLIC_DIR = path.join(WEB_APP_ROOT, 'public', 'pdfjs');

function getRequire(requireFn) {
  return requireFn ?? createRequire(import.meta.url);
}

export function resolvePdfJsAssetPath(fileName, requireFn) {
  try {
    return getRequire(requireFn).resolve(`pdfjs-dist/build/${fileName}`);
  } catch (error) {
    const detail = error instanceof Error ? error.message : String(error);
    throw new Error(
      `Unable to resolve pdfjs-dist asset "${fileName}". Run "pnpm install" and verify the installed pdfjs-dist layout. ${detail}`,
    );
  }
}

export async function syncPdfJsAssets(options = {}) {
  const {
    destinationDir = PDFJS_PUBLIC_DIR,
    requireFn,
  } = options;

  await mkdir(destinationDir, { recursive: true });

  const files = await Promise.all(
    PDFJS_ASSET_FILES.map(async (fileName) => {
      const sourcePath = resolvePdfJsAssetPath(fileName, requireFn);
      const destinationPath = path.join(destinationDir, fileName);

      await copyFile(sourcePath, destinationPath);

      return {
        fileName,
        sourcePath,
        destinationPath,
      };
    }),
  );

  return {
    destinationDir,
    files,
  };
}

async function main() {
  const result = await syncPdfJsAssets();
  const copiedFiles = result.files.map((file) => file.fileName).join(', ');
  console.log(`[sync-pdfjs-assets] Synced ${copiedFiles} to ${result.destinationDir}`);
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  main().catch((error) => {
    const message = error instanceof Error ? error.message : String(error);
    console.error(`[sync-pdfjs-assets] ${message}`);
    process.exitCode = 1;
  });
}
