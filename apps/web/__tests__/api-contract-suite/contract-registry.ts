import type { AnyRouteContract } from '@propertypro/api-contract';

export interface RegisteredContract {
  /** Source file (glob key), e.g. '../../src/app/api/v1/residents/contract.ts'. */
  file: string;
  /** Named export, e.g. 'residentsListContract'. */
  exportName: string;
  contract: AnyRouteContract;
}

const HTTP_METHODS = new Set(['GET', 'POST', 'PATCH', 'PUT', 'DELETE']);

/** Structural test — a value is a route contract if it has the runtime shape. */
function isRouteContract(value: unknown): value is AnyRouteContract {
  if (!value || typeof value !== 'object') return false;
  const o = value as Record<string, unknown>;
  const response = o['response'] as { safeParse?: unknown } | undefined;
  return (
    typeof o['method'] === 'string' &&
    HTTP_METHODS.has(o['method'] as string) &&
    typeof o['path'] === 'string' &&
    typeof o['request'] === 'object' &&
    o['request'] !== null &&
    typeof response?.safeParse === 'function'
  );
}

// `import.meta.glob` is a Vite build-time feature. Its types ship in
// `vite/client`, which this project's tsconfig does not reference (pulling it
// in would also add Vite's ambient asset-module declarations program-wide), so
// declare the single member this file uses.
declare global {
  interface ImportMeta {
    glob(pattern: string, options: { eager: true }): Record<string, unknown>;
  }
}

// Vite eagerly inlines these imports at build time. Path is relative to THIS
// file: up out of api-contract-suite/ and __tests__/ into apps/web/, then src.
const modules = import.meta.glob('../../src/app/api/**/contract.ts', {
  eager: true,
});

export function loadContractRegistry(): RegisteredContract[] {
  const out: RegisteredContract[] = [];
  for (const [file, mod] of Object.entries(modules)) {
    for (const [exportName, value] of Object.entries(mod as Record<string, unknown>)) {
      if (isRouteContract(value)) {
        out.push({ file, exportName, contract: value });
      }
    }
  }
  out.sort((a, b) =>
    `${a.file}#${a.exportName}`.localeCompare(`${b.file}#${b.exportName}`),
  );
  return out;
}
