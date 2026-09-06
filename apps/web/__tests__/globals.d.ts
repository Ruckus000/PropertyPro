/**
 * Ambient declarations for the web test suite.
 *
 * `__tests__/**` was outside `apps/web/tsconfig.json`'s `include` until this
 * change, so none of these files was ever type-checked. Bringing them in
 * surfaced 609 errors; almost all were test-idiom noise (a missing non-null
 * assertion under `noUncheckedIndexedAccess`). This file covers the ones that
 * are genuinely missing type information rather than a missing assertion.
 *
 * Precedent: `apps/admin/__tests__/globals.d.ts`, added when the admin app
 * closed the same gap.
 */
import type { AxeMatchers } from 'vitest-axe/matchers';

declare module 'vitest' {
  /**
   * `__tests__/setup.jsdom.ts` installs vitest-axe's matchers with
   * `expect.extend(vitestAxeMatchers)`, but the package ships its types only as
   * a global `namespace Vi` augmentation (`vitest-axe/extend-expect`) — the
   * vitest 0.x/1.x extension point. Vitest 3 resolves custom matchers through
   * `Matchers` in `@vitest/expect`, so `toHaveNoViolations` was invisible to the
   * type checker even though it is installed at runtime.
   *
   * `_T` exists only to merge with upstream's generic `Matchers<T>`; the axe
   * matcher does not vary with the asserted type.
   */
  interface Matchers<_T = unknown> {
    toHaveNoViolations: AxeMatchers['toHaveNoViolations'];
  }
}

export {};
