import { beforeEach, describe, expect, it, vi } from 'vitest';

const { captureMessageMock } = vi.hoisted(() => ({
  captureMessageMock: vi.fn(),
}));

vi.mock('@sentry/nextjs', () => ({
  captureMessage: captureMessageMock,
}));

import { resolvePlanIdWithTelemetry } from '../plan-resolution';

describe('resolvePlanIdWithTelemetry', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns the canonical PlanId for canonical input and does not log', () => {
    const planId = resolvePlanIdWithTelemetry('essentials', { site: 'test' });
    expect(planId).toBe('essentials');
    expect(captureMessageMock).not.toHaveBeenCalled();
  });

  it('returns the resolved PlanId for legacy aliases and does not log', () => {
    const planId = resolvePlanIdWithTelemetry('full_platform', { site: 'test' });
    expect(planId).toBe('professional');
    expect(captureMessageMock).not.toHaveBeenCalled();
  });

  it('returns null for null input and does not log (unprovisioned is expected)', () => {
    const planId = resolvePlanIdWithTelemetry(null, { site: 'test' });
    expect(planId).toBeNull();
    expect(captureMessageMock).not.toHaveBeenCalled();
  });

  it('fires a warning when a non-null value fails to resolve (corruption signal)', () => {
    const planId = resolvePlanIdWithTelemetry('price_1THjwBK4289h3aRcMUun7mqB', {
      site: 'test',
      communityId: 282,
    });
    expect(planId).toBeNull();
    expect(captureMessageMock).toHaveBeenCalledWith('plan_resolution_failed', {
      level: 'warning',
      extra: {
        rawPlan: 'price_1THjwBK4289h3aRcMUun7mqB',
        site: 'test',
        communityId: 282,
      },
    });
  });

  it('merges arbitrary context fields into the Sentry extra payload', () => {
    resolvePlanIdWithTelemetry('garbage', {
      site: 'plan-guard:requirePlanFeature',
      communityId: 42,
      featureKey: 'hasFinance',
    });
    expect(captureMessageMock).toHaveBeenCalledWith(
      'plan_resolution_failed',
      expect.objectContaining({
        level: 'warning',
        extra: expect.objectContaining({
          rawPlan: 'garbage',
          site: 'plan-guard:requirePlanFeature',
          communityId: 42,
          featureKey: 'hasFinance',
        }),
      }),
    );
  });
});
