/**
 * Site-editor utilities — photo storage usage on the settings response.
 *
 * `storage` is READ-ONLY and rides on the existing settings record rather than
 * a route of its own. The two things this file pins:
 *
 *   1. the response carries usage and the quota, and REQUIRES them — the
 *      runner's response validation is the canary for a route that forgets
 *      (the PATCH response is cached straight into the query, so a GET-only
 *      field would blank the meter after every save);
 *   2. the PATCH body still rejects `assetsBytesUsed`. Reading the counter is
 *      new; reaching it through the write path is the mass-assignment hole
 *      `.strict()` was put there to close, and this must not have reopened it.
 *
 * Fixtures are built from the REAL schemas — `searchIndexing` and
 * `showStatutoryLine` are required — so a parse failure here is about
 * `storage`, not about a fixture that drifted from the contract.
 */
import { describe, it, expect } from 'vitest';
import {
  siteSettingsGetContract,
  siteSettingsPatchContract,
} from '@/app/api/v1/pm/site/settings/contract';

const settings = {
  seoTitle: null,
  seoDescription: null,
  searchIndexing: true,
  favicon: null,
};

const footer = {
  associationName: null,
  note: null,
  showStatutoryLine: false,
};

describe('site settings storage fields', () => {
  // Asserted on the parsed OUTPUT, not on `success`: a non-strict Zod object
  // silently strips an unknown key, so `success` alone would have been true
  // before `storage` existed on the schema.
  it('the response carries usage and the quota', () => {
    const parsed = siteSettingsGetContract.response.safeParse({
      settings,
      footer,
      storage: { assetsBytesUsed: 1024, quotaBytes: 524288000 },
    });
    expect(parsed.success).toBe(true);
    expect(parsed.success && parsed.data.storage).toEqual({
      assetsBytesUsed: 1024,
      quotaBytes: 524288000,
    });
  });

  it('the response accepts a null quota — no plan limit is a real state', () => {
    const parsed = siteSettingsGetContract.response.safeParse({
      settings,
      footer,
      storage: { assetsBytesUsed: 1024, quotaBytes: null },
    });
    expect(parsed.success).toBe(true);
    expect(parsed.success && parsed.data.storage).toEqual({
      assetsBytesUsed: 1024,
      quotaBytes: null,
    });
  });

  it('the response REQUIRES storage — a route that forgets it fails loudly', () => {
    const parsed = siteSettingsGetContract.response.safeParse({ settings, footer });
    expect(parsed.success).toBe(false);
  });

  // GET and PATCH share one response schema. Pinned separately so a future
  // split cannot drop the field from the PATCH side, which is the one the
  // client writes into its cache.
  it('the PATCH response carries storage too', () => {
    const parsed = siteSettingsPatchContract.response.safeParse({
      settings,
      footer,
      storage: { assetsBytesUsed: 0, quotaBytes: 104857600 },
    });
    expect(parsed.success && parsed.data.storage).toEqual({
      assetsBytesUsed: 0,
      quotaBytes: 104857600,
    });
  });

  it('the PATCH body still rejects assetsBytesUsed', () => {
    const parsed = siteSettingsPatchContract.request.body!.safeParse({
      communityId: 1,
      assetsBytesUsed: 0,
    });
    expect(parsed.success).toBe(false);
  });

  it('rejects a negative or fractional usage, and a zero quota', () => {
    const negative = siteSettingsGetContract.response.safeParse({
      settings,
      footer,
      storage: { assetsBytesUsed: -1, quotaBytes: 1 },
    });
    const fractional = siteSettingsGetContract.response.safeParse({
      settings,
      footer,
      storage: { assetsBytesUsed: 1.5, quotaBytes: 1 },
    });
    // A zero quota would put a division by zero in the meter; a plan with no
    // storage is expressed as null, never 0.
    const zeroQuota = siteSettingsGetContract.response.safeParse({
      settings,
      footer,
      storage: { assetsBytesUsed: 0, quotaBytes: 0 },
    });
    expect(negative.success).toBe(false);
    expect(fractional.success).toBe(false);
    expect(zeroQuota.success).toBe(false);
  });
});
