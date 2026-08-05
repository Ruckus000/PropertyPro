/**
 * `@propertypro/shared/http` — the route-layer primitives shared by apps/web
 * and apps/admin.
 *
 * Deliberately a SUBPATH export rather than part of the root barrel. 31 web
 * test files do `vi.mock('@propertypro/shared', () => ({ ...a few symbols }))`
 * with bare factories, so anything added to the root barrel becomes `undefined`
 * inside those tests — which for `AppError` would silently turn
 * `error instanceof AppError` false and route every handled error to the 500
 * branch. A narrow subpath is invisible to those mocks.
 */
export * from './errors';
export * from './request-context';
