/**
 * Unit tests for reserve-asset remaining-useful-life (RUL) banding.
 *
 * The boundary cases are the point — an off-by-one here mislabels a component's
 * countdown badge. The band is a neutral time-remaining bucket, never a
 * judgment about condition or adequacy.
 */
import { describe, expect, it } from 'vitest';
import {
  classifyReserveAssetRul,
  reserveAssetEscalationTier,
} from '../../src/lib/services/reserve-asset-rul';

const REFERENCE_YEAR = 2026;

describe('classifyReserveAssetRul', () => {
  it('computes endOfLifeYear and yearsRemaining from entered fields', () => {
    const { endOfLifeYear, yearsRemaining } = classifyReserveAssetRul(2015, 25, REFERENCE_YEAR);
    expect(endOfLifeYear).toBe(2040);
    expect(yearsRemaining).toBe(14);
  });

  it('bands an elapsed useful life as past_life with negative years', () => {
    const { band, yearsRemaining } = classifyReserveAssetRul(2000, 10, REFERENCE_YEAR);
    expect(band).toBe('past_life');
    expect(yearsRemaining).toBe(-16);
  });

  describe('boundaries', () => {
    // Bands: past_life (<0) | urgent (0–2) | aware (3–5) | healthy (>5).
    it.each([
      // yearInstalled, usefulLifeYears, expectedYearsRemaining, expectedBand
      [2025, 0, -1, 'past_life'],
      [2020, 6, 0, 'urgent'],
      [2020, 8, 2, 'urgent'],
      [2020, 9, 3, 'aware'],
      [2020, 11, 5, 'aware'],
      [2020, 12, 6, 'healthy'],
      [2026, 30, 30, 'healthy'],
    ])('installed %i + %i-year life → %i yrs left → %s', (installed, life, expectedYears, expectedBand) => {
      const { band, yearsRemaining } = classifyReserveAssetRul(
        installed as number,
        life as number,
        REFERENCE_YEAR,
      );
      expect(yearsRemaining).toBe(expectedYears);
      expect(band).toBe(expectedBand);
    });
  });

  it('defaults the reference year to the current UTC year', () => {
    const currentYear = new Date().getUTCFullYear();
    const { yearsRemaining } = classifyReserveAssetRul(currentYear, 10);
    expect(yearsRemaining).toBe(10);
  });
});

describe('reserveAssetEscalationTier', () => {
  it.each([
    ['past_life', 'critical'],
    ['urgent', 'urgent'],
    ['aware', 'aware'],
    ['healthy', 'calm'],
  ])('%s → %s', (band, tier) => {
    expect(reserveAssetEscalationTier(band as never)).toBe(tier);
  });
});
