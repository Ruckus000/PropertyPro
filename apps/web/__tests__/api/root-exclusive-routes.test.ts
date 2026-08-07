import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

/**
 * R3-03 / ADR-006 §2 — the fence against re-widening.
 *
 * ADR-006 names exactly four root-exclusive powers: role assignment,
 * billing/subscription, community deletion, and root transfer. Every route
 * implementing one of them must gate on `requireRootManager` (or, where the
 * handler must redirect rather than throw, `hasRole(..., ['root_manager'])`).
 *
 * This is a source-text assertion rather than a behavioural one on purpose. The
 * failure mode it guards is not a bug in one handler — it is someone
 * "harmonizing" a root-exclusive route back onto `requirePermission(membership,
 * 'settings', 'write')` because that is what every neighbouring route uses.
 * That change would look correct in review and would silently re-admit every
 * property manager, because the RBAC matrix collapses `property_manager` and
 * `root_manager` onto a single `manager` row and cannot tell them apart.
 *
 * If you are here because this test failed: the route you edited is
 * root-exclusive. Do not swap in `settings:write`. If you genuinely intend to
 * remove a power from the root-exclusive set, that is an ADR-006 amendment —
 * update the ADR and this list together.
 */

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const webSrc = path.resolve(__dirname, '../../src');

/** Routes that throw a ForbiddenError (wrapped by `withErrorHandler`). */
const THROWING_ROOT_ONLY_ROUTES = [
  // Billing / subscription
  'app/api/v1/subscribe/route.ts',
  'app/api/v1/subscribe/change-plan/route.ts',
  // Community deletion
  'app/api/v1/communities/delete/route.ts',
  // Role assignment + root transfer (root-only since Phase 2b/2c)
  'app/api/v1/communities/role-assignments/route.ts',
  'app/api/v1/communities/designations/route.ts',
  'app/api/v1/communities/transfer-root/route.ts',
] as const;

/**
 * Routes that must REDIRECT instead of throwing. `/billing/portal` is a plain
 * App Router handler with no `withErrorHandler`, so a raw ForbiddenError would
 * surface as an opaque 500 plus a Sentry event.
 */
const REDIRECTING_ROOT_ONLY_ROUTES = [
  'app/(authenticated)/billing/portal/route.ts',
] as const;

const SETTINGS_WRITE = /requirePermission\(\s*membership\s*,\s*['"]settings['"]\s*,\s*['"]write['"]\s*\)/;

describe('root-exclusive routes (ADR-006 §2 / R3-03)', () => {
  it.each(THROWING_ROOT_ONLY_ROUTES)('%s gates on requireRootManager', (route) => {
    const source = fs.readFileSync(path.join(webSrc, route), 'utf8');

    expect(source).toMatch(
      /import\s*{[^}]*\brequireRootManager\b[^}]*}\s*from\s*['"]@\/lib\/api\/role-guard['"]/,
    );
    expect(source).toMatch(/requireRootManager\(/);
  });

  it.each(REDIRECTING_ROOT_ONLY_ROUTES)('%s gates on a root-only hasRole', (route) => {
    const source = fs.readFileSync(path.join(webSrc, route), 'utf8');

    expect(source).toMatch(
      /import\s*{[^}]*\bhasRole\b[^}]*}\s*from\s*['"]@\/lib\/api\/role-guard['"]/,
    );
    expect(source).toMatch(/hasRole\(\s*membership\s*,\s*\[\s*['"]root_manager['"]\s*\]\s*\)/);
  });

  it.each([...THROWING_ROOT_ONLY_ROUTES, ...REDIRECTING_ROOT_ONLY_ROUTES])(
    '%s does NOT fall back to settings:write',
    (route) => {
      const source = fs.readFileSync(path.join(webSrc, route), 'utf8');

      // `settings:write` resolves through the single `manager` matrix row, so
      // it admits every property manager — it cannot express root-exclusivity.
      expect(source).not.toMatch(SETTINGS_WRITE);
    },
  );
});

/**
 * The documented EXCEPTION, pinned so nobody "finishes the job" on it.
 *
 * `/api/v1/communities/[id]/cancel` cancels the subscription and soft-deletes
 * the community — both root-exclusive powers on their face — but it gates on
 * BILLING-GROUP OWNERSHIP, a portfolio-level financial identity that is
 * orthogonal to community role. The owner may not be a member of the child
 * community at all, so adding a root check here would break the legitimate
 * multi-community PM cancel flow.
 */
describe('billing-group cancel is owner-gated, not root-gated (deliberate)', () => {
  it('gates on the billing-group owner and not on a community role', () => {
    const source = fs.readFileSync(
      path.join(webSrc, 'app/api/v1/communities/[id]/cancel/route.ts'),
      'utf8',
    );

    expect(source).toMatch(/getBillingGroupOwner/);
    expect(source).not.toMatch(/requireRootManager\(/);
    expect(source).not.toMatch(SETTINGS_WRITE);
  });
});
