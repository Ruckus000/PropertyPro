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

  it('Professional has hasSiteCustomDomain (Pro+ custom domain)', () => {
    expect(PLAN_FEATURES.professional.features.hasSiteCustomDomain).toBe(true);
  });

  it('Operations Plus has hasSiteCustomDomain (Pro+ custom domain)', () => {
    expect(PLAN_FEATURES.operations_plus.features.hasSiteCustomDomain).toBe(true);
  });

  it('Operations Plus has hasSitePortfolioTemplates (Phase 2 — operations_plus only)', () => {
    expect(PLAN_FEATURES.operations_plus.features.hasSitePortfolioTemplates).toBe(true);
  });

  it('Professional does NOT have hasSitePortfolioTemplates (operations_plus only)', () => {
    expect(PLAN_FEATURES.professional.features.hasSitePortfolioTemplates).toBeFalsy();
  });

  it('Essentials does NOT have hasSitePortfolioTemplates (operations_plus only)', () => {
    expect(PLAN_FEATURES.essentials.features.hasSitePortfolioTemplates).toBeFalsy();
  });

  it('Essentials does NOT have hasSiteCustomDomain', () => {
    expect(PLAN_FEATURES.essentials.features.hasSiteCustomDomain).toBeFalsy();
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
