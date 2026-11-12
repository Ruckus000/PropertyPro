/**
 * The emergency broadcast composer offered "Owners only" to apartment
 * communities, which have no owner role — an alert sent there reaches nobody
 * (empty-state audit, 2026-11-11).
 */
import { describe, expect, it } from 'vitest';
import { getBroadcastAudienceOptions } from '../../src/components/emergency/broadcast-audience';

describe('getBroadcastAudienceOptions', () => {
  it('offers an apartment only "all residents"', () => {
    expect(getBroadcastAudienceOptions('apartment')).toEqual(['all']);
  });

  it('offers a condo and an HOA "owners only" as well', () => {
    expect(getBroadcastAudienceOptions('condo_718')).toEqual(['all', 'owners_only']);
    expect(getBroadcastAudienceOptions('hoa_720')).toEqual(['all', 'owners_only']);
  });
});
