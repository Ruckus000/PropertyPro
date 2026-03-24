/**
 * Type declarations for pdfjs-dist ESM bundle and the same-origin proxy route.
 *
 * pdfjs-dist ships .mjs files without declaration files; these ambient
 * declarations re-export the types from the main `pdfjs-dist` entry so that
 * TypeScript resolves them without `skipLibCheck` or `@ts-ignore`.
 */

declare module 'pdfjs-dist/build/pdf.mjs' {
  export * from 'pdfjs-dist';
}

/**
 * The `/pdfjs/pdf.mjs` path is a same-origin Next.js route that proxies the
 * pdfjs-dist browser bundle. At runtime it resolves to the actual module; at
 * type-check time we point it at the canonical types.
 */
declare module '/pdfjs/pdf.mjs' {
  export * from 'pdfjs-dist';
}
