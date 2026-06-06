// No-op stub for the `server-only` package under vitest.
// Next.js resolves `server-only` at build time; it has no standalone module in
// node_modules, so the vitest config aliases imports of it to this empty file.
// The real guard (preventing client bundling) is enforced by Next's bundler,
// not by tests.
export {};
