import { describe, expect, it } from 'vitest';
import { renderHook } from '@testing-library/react';
import { usePlanGate } from '../use-plan-gate';

describe('usePlanGate', () => {
  it('null planId returns allowed: true, upgradePlan: null', () => {
    const { result } = renderHook(() => usePlanGate(null, 'hasEsign'));
    expect(result.current).toEqual({ allowed: true, upgradePlan: null });
  });

  it('plan includes feature returns allowed: true, upgradePlan: null', () => {
    // Professional includes hasEsign
    const { result } = renderHook(() => usePlanGate('professional', 'hasEsign'));
    expect(result.current).toEqual({ allowed: true, upgradePlan: null });
  });

  it('plan does not include feature returns allowed: false with upgrade info', () => {
    // Essentials does NOT include hasEsign
    const { result } = renderHook(() => usePlanGate('essentials', 'hasEsign'));
    expect(result.current.allowed).toBe(false);
    expect(result.current.upgradePlan).not.toBeNull();
    expect(result.current.upgradePlan!.displayName).toBeTruthy();
    expect(result.current.upgradePlan!.monthlyPriceUsd).toBeGreaterThan(0);
  });

  it('upgrade plan is the cheapest plan that includes the feature', () => {
    // hasEsign is in professional ($349) and operations_plus ($499)
    // cheapest should be professional
    const { result } = renderHook(() => usePlanGate('essentials', 'hasEsign'));
    expect(result.current.allowed).toBe(false);
    expect(result.current.upgradePlan).toEqual({
      displayName: 'Professional',
      monthlyPriceUsd: 349,
    });
  });

  it('essentials plan allows features it includes', () => {
    const { result } = renderHook(() => usePlanGate('essentials', 'hasCompliance'));
    expect(result.current).toEqual({ allowed: true, upgradePlan: null });
  });

  it('operations_plus allows apartment-specific features', () => {
    const { result } = renderHook(() => usePlanGate('operations_plus', 'hasLeaseTracking'));
    expect(result.current).toEqual({ allowed: true, upgradePlan: null });
  });

  it('essentials does not allow hasViolations, suggests cheapest upgrade', () => {
    const { result } = renderHook(() => usePlanGate('essentials', 'hasViolations'));
    expect(result.current.allowed).toBe(false);
    // Both professional and operations_plus have hasViolations;
    // professional ($349) is cheaper than operations_plus ($499)
    expect(result.current.upgradePlan).toEqual({
      displayName: 'Professional',
      monthlyPriceUsd: 349,
    });
  });
});
