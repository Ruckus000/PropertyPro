import { describe, it, expect } from 'vitest';
import { PLAN_FEATURES } from '../../src/features/plan-features';

describe('PLAN_FEATURES — site editor flags', () => {
  it('Essentials has hasSiteEditor:true', () => {
    expect(PLAN_FEATURES.essentials.features.hasSiteEditor).toBe(true);
  });

  it('Essentials does NOT have hasSitePolishBlocks', () => {
    expect(PLAN_FEATURES.essentials.features.hasSitePolishBlocks).toBeFalsy();
  });

  it('Essentials does NOT have hasSiteCustomCss', () => {
    expect(PLAN_FEATURES.essentials.features.hasSiteCustomCss).toBeFalsy();
  });

  it('Professional has hasSiteEditor + hasSitePolishBlocks + hasSiteCustomCss', () => {
    expect(PLAN_FEATURES.professional.features.hasSiteEditor).toBe(true);
    expect(PLAN_FEATURES.professional.features.hasSitePolishBlocks).toBe(true);
    expect(PLAN_FEATURES.professional.features.hasSiteCustomCss).toBe(true);
  });

  it('Professional does NOT have Phase 2 flags (custom domain, portfolio templates)', () => {
    expect(PLAN_FEATURES.professional.features.hasSiteCustomDomain).toBeFalsy();
    expect(PLAN_FEATURES.professional.features.hasSitePortfolioTemplates).toBeFalsy();
  });
});

describe('PLAN_FEATURES — siteAssetsQuotaBytes', () => {
  it('Essentials quota is 100 MB', () => {
    expect(PLAN_FEATURES.essentials.siteAssetsQuotaBytes).toBe(100 * 1024 * 1024);
  });

  it('Professional quota is 500 MB', () => {
    expect(PLAN_FEATURES.professional.siteAssetsQuotaBytes).toBe(500 * 1024 * 1024);
  });
});
