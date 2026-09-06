/**
 * Ambient types for `sync-pdfjs-assets.mjs`.
 *
 * The script is plain ESM JavaScript (it runs from `package.json` scripts and
 * must not depend on a build step), so it carries no types of its own and
 * `apps/web/__tests__/pdf/sync-pdfjs-assets-script.test.ts` imported it as an
 * implicit `any`. This declaration mirrors the script's real export signatures
 * — nothing here is wider than what the module actually returns.
 *
 * Relative imports never consult ambient `declare module` blocks, so this has
 * to sit beside the `.mjs` file rather than in a test-suite `.d.ts`.
 */

/** Asset file names copied out of `pdfjs-dist/build` into `public/pdfjs`. */
export const PDFJS_ASSET_FILES: readonly string[];

export const WEB_APP_ROOT: string;
export const PDFJS_PUBLIC_DIR: string;

/** The `require`-like resolver the script uses to locate pdfjs-dist assets. */
export interface PdfJsAssetRequire {
  resolve(specifier: string): string;
}

export function resolvePdfJsAssetPath(
  fileName: string,
  requireFn?: PdfJsAssetRequire,
): string;

export interface SyncPdfJsAssetsOptions {
  destinationDir?: string;
  requireFn?: PdfJsAssetRequire;
}

export interface SyncedPdfJsAsset {
  fileName: string;
  sourcePath: string;
  destinationPath: string;
}

export interface SyncPdfJsAssetsResult {
  destinationDir: string;
  files: SyncedPdfJsAsset[];
}

export function syncPdfJsAssets(
  options?: SyncPdfJsAssetsOptions,
): Promise<SyncPdfJsAssetsResult>;
