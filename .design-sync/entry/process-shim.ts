// Next's client modules read `process.env` at MODULE TOP LEVEL
// (next/dist/client/add-base-path.js:13 — `const basePath = process.env.… || ''`).
// esbuild with platform:browser does not shim `process`, so without this the
// IIFE throws ReferenceError at bundle-eval time and NO export is assigned —
// losing every component, not just the two that import next/link.
// Exported (and re-exported from index.ts) so tree-shaking cannot drop it.
const g = globalThis as unknown as { process?: { env: Record<string, string | undefined> } };
g.process ??= { env: {} };
g.process.env ??= {};
g.process.env.NODE_ENV ??= 'production';
export const PROCESS_SHIM = true;
