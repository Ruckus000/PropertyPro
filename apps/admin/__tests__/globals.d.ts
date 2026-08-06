/**
 * Ambient declarations for the admin test suite.
 *
 * `__tests__/**` was outside `tsconfig.json`'s `include` until 2026-08-05, so
 * none of these files was ever type-checked. Bringing them in surfaced 64
 * errors, most of them test-idiom noise rather than product bugs — this file
 * covers the one that is genuinely missing type information rather than a
 * missing non-null assertion.
 *
 * React's `act()` requires this flag, and React ships no type for it.
 */
declare global {
  // eslint-disable-next-line no-var
  var IS_REACT_ACT_ENVIRONMENT: boolean | undefined;
}

export {};
