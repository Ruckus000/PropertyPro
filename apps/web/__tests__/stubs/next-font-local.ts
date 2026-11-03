// Stub for `next/font/local` under vitest.
// `next/font/local` is a build-time transform: SWC rewrites each `localFont({...})`
// call into a generated object, so under vitest, where nothing runs that
// transform, the call throws "is not a function" at module load and takes down
// every test that imports a file calling it (site-font.ts is imported by every
// site-frame root). The vitest config aliases the import to this stub.
// What the font really emits is asserted by reading source (font-loading.test.ts,
// public-site-font.test.ts), not by calling the loader.
export default function localFont(): { className: string; variable: string; style: { fontFamily: string } } {
  return { className: 'stub-font', variable: 'stub-font-var', style: { fontFamily: 'stub' } };
}
