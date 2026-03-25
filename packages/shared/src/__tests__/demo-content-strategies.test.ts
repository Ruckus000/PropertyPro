import { describe, it, expect } from 'vitest';
import {
  getContentStrategies,
  getDefaultStrategy,
  getStrategyById,
  CONTENT_STRATEGIES,
} from '../demo-content-strategies';

describe('demo-content-strategies', () => {
  it('has 4 strategies', () => {
    expect(CONTENT_STRATEGIES).toHaveLength(4);
  });

  it('getContentStrategies filters by community type', () => {
    const strategies = getContentStrategies('condo_718');
    expect(strategies.length).toBeGreaterThan(0);
    strategies.forEach((s) => {
      expect(s.appliesTo).toContain('condo_718');
    });
  });

  it('getDefaultStrategy returns correct default per type', () => {
    expect(getDefaultStrategy('condo_718').id).toBe('compliance-heavy');
    expect(getDefaultStrategy('apartment').id).toBe('maintenance-focused');
    expect(getDefaultStrategy('hoa_720').id).toBe('transparency-forward');
  });

  it('getStrategyById returns strategy for valid ID', () => {
    expect(getStrategyById('compliance-heavy')).toBeDefined();
  });

  it('getStrategyById returns undefined for invalid ID', () => {
    expect(getStrategyById('nope')).toBeUndefined();
  });

  it('every strategy has valid seedHints', () => {
    for (const s of CONTENT_STRATEGIES) {
      expect(s.seedHints.complianceScore).toBeGreaterThanOrEqual(0);
      expect(s.seedHints.complianceScore).toBeLessThanOrEqual(100);
      expect(['compliance', 'maintenance', 'financial', 'general']).toContain(s.seedHints.documentBias);
      expect(['low', 'medium', 'high']).toContain(s.seedHints.meetingDensity);
      expect(['formal', 'friendly', 'urgent']).toContain(s.seedHints.announcementTone);
    }
  });
});
