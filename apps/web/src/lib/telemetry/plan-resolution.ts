import { captureMessage } from '@sentry/nextjs';
import { resolvePlanId } from '@propertypro/shared';
import type { PlanId } from '@propertypro/shared';

/**
 * Resolve a plan string to a canonical PlanId, emitting a structured warning
 * to observability if the input is non-null but unresolvable.
 *
 * A non-null → null transition almost always means corruption in
 * `communities.subscription_plan` — e.g. a raw Stripe `price_…` string written
 * by a broken webhook. Because the plan-guard layer treats unknown plan as
 * fail-open (new community / legacy plan), corruption silently unlocks every
 * plan-gated feature. This helper logs the event so regressions surface in
 * Sentry within one request instead of going silent for weeks.
 *
 * The functional behavior is identical to `resolvePlanId`; the logging is a
 * pure side-effect.
 */
export function resolvePlanIdWithTelemetry(
  rawPlan: string | null,
  context: { site: string } & Record<string, unknown>,
): PlanId | null {
  const planId = resolvePlanId(rawPlan);
  if (rawPlan !== null && planId === null) {
    captureMessage('plan_resolution_failed', {
      level: 'warning',
      extra: { rawPlan, ...context },
    });
  }
  return planId;
}
