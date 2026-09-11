/**
 * The shared shape of the five subscription-action routes.
 *
 * ## Why these five share a runner
 *
 * They differ only in their input schema, which action function they call, and
 * which audit action they record. Everything else — the platform-admin gate, the
 * `confirm: true` requirement, the id parse, the ordering of the three, the audit
 * write, the response envelope — is a safety property that must be identical
 * across all five, and five hand-written copies of a safety property is five
 * chances for one of them to be subtly different. (That is not hypothetical in
 * this app: `apps/admin` had FIVE competing audit-logging idioms before
 * `logAdminAction`, and eleven privileged mutations that logged nothing.)
 *
 * The `confirm` literal in particular lives in ONE place here, so there is one
 * line to remove to prove every one of the five tests that depends on it is
 * measuring something.
 *
 * ## The order of the gates, and why it is this order
 *
 *   1. `requirePlatformAdmin()` — first statement, before the body is read.
 *   2. id shape — a positive integer, or 400.
 *   3. body schema, which is where `confirm: true` is enforced.
 *   4. the action, which loads the community and asserts Stripe mode.
 *   5. `logAdminAction`, only after the action resolved.
 *
 * Steps 1–3 all complete before step 4, so a request with no `confirm` never
 * reaches Stripe. That is the property the route tests assert, and they assert
 * "the action was not called" BEFORE asserting the status — a 400 with a Stripe
 * call already made is a far worse failure than a wrong status code, and an
 * assertion order that reports the status first would name the lesser harm.
 *
 * Step 5 is last because an audit row records a CHANGE, not an attempt: a refused
 * or failed action must leave no entry. Conversely the audit write is `await`ed
 * and not `bestEffort`, so a trail failure surfaces — these are the only actions
 * in the console that move money, and an unrecorded charge is worse than a failed
 * request. `AdminAuditLogError`'s message says the operation COMPLETED for exactly
 * this case.
 *
 * @module lib/api/billing-action-route
 */
import { NextResponse, type NextRequest } from 'next/server';
import { z } from 'zod';

import { parseAdminBody } from '@/lib/api/parse-body';
import { parseCommunityIdParam } from '@/lib/api/parse-community-id';
import { withAdminErrorHandler } from '@/lib/api/with-error-handler';
import { logAdminAction, type AdminAuditAction } from '@/lib/audit/log-admin-action';
import { requirePlatformAdmin } from '@/lib/auth/platform-admin';
import type { ActionResult } from '@/lib/server/billing-actions';

/**
 * The confirmation every money-moving action requires.
 *
 * `z.literal(true)` — NOT a truthy check. `confirm: 1`, `confirm: 'true'` and
 * `confirm: 'yes'` are all rejected, because each is what an accidental or
 * machine-generated request looks like, and the point of this field is that a
 * HUMAN passed through the `AlertDialog` that sets it. A truthy check would admit
 * every one of them.
 *
 * This is the single definition for all five routes. Removing the field from this
 * object is the one-line revert that must redden every "requires confirm" test.
 */
const CONFIRM_FIELD = {
  confirm: z.literal(true, {
    error: 'This action changes a live subscription. Send confirm: true to proceed.',
  }),
};

/**
 * An action's own input, plus the confirmation, with unknown keys rejected.
 *
 * `.strict()` so a misspelled field (`atPeriodEnd` as `at_period_end`) is a 400
 * rather than silently defaulting — on a cancel, the difference between those two
 * is "at the end of the period" versus "right now".
 */
export function confirmedActionSchema<TShape extends z.ZodRawShape>(shape: TShape) {
  return z.object({ ...CONFIRM_FIELD, ...shape }).strict();
}

/**
 * Exported, not local: the five route files re-export a `POST` whose type
 * mentions this, and TypeScript refuses to emit a declaration naming a type it
 * cannot reference (TS4023).
 */
export interface BillingActionRouteContext {
  params: Promise<{ id: string }>;
}

/** The resource every one of the five acts on. */
const RESOURCE_TYPE = 'subscription';

export function billingActionRoute<TSchema extends z.ZodObject<z.ZodRawShape>>(config: {
  schema: TSchema;
  /**
   * The audit action name — a literal, or a function of the validated input.
   *
   * The function form exists for `pause`, which is one route in BOTH directions
   * because it is one Stripe field. A single `'subscription_paused'` for both
   * meant a query filtering on `action = 'subscription_paused'` returned resumes
   * too, and `platform_admin_audit_log` is append-only, so the mislabelling is
   * permanent. The direction is a different ACTION, not a boolean inside one.
   */
  auditAction: AdminAuditAction | ((input: z.infer<TSchema>) => AdminAuditAction);
  run: (communityId: number, input: z.infer<TSchema>) => Promise<ActionResult>;
}): (request: NextRequest, context: BillingActionRouteContext) => Promise<Response> {
  return withAdminErrorHandler(async (request: NextRequest, context: BillingActionRouteContext) => {
    const admin = await requirePlatformAdmin();

    const { id } = await context.params;
    const communityId = parseCommunityIdParam(id);
    if (communityId instanceof NextResponse) return communityId;

    const parsed = await parseAdminBody(request, config.schema);
    if (parsed instanceof NextResponse) return parsed;

    const result = await config.run(communityId, parsed);

    await logAdminAction({
      admin,
      action:
        typeof config.auditAction === 'function' ? config.auditAction(parsed) : config.auditAction,
      resourceType: RESOURCE_TYPE,
      // The `sub_…` id, so the trail joins to Stripe with no second lookup.
      resourceId: result.subscriptionId,
      // Always set, never null: unlike a support ticket or a cron job, a
      // subscription belongs to exactly one community.
      communityId,
      oldValues: result.before,
      newValues: result.after,
    });

    return NextResponse.json({ data: { after: result.after } });
  });
}
