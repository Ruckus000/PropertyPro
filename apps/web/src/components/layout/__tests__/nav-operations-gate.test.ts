import { describe, expect, it } from 'vitest';
import { SIDEBAR_NAV, getVisibleItems } from '../nav-config';
import { getEffectiveFeatures, resolvePlanId } from '@propertypro/shared';
import type { CommunityType } from '@propertypro/shared';

function featuresFor(type: CommunityType, plan: string | null) {
  return getEffectiveFeatures(type, resolvePlanId(plan));
}

const operationsEntry = SIDEBAR_NAV.find((item) => item.id === 'operations');

describe('Operations nav entry visibility — feature matrix', () => {
  it('exists in the sidebar config', () => {
    expect(operationsEntry).toBeDefined();
  });

  it('condo_718 + professional + resident → visible', () => {
    const features = featuresFor('condo_718', 'professional');
    const visible = getVisibleItems([operationsEntry!], 'resident', features);
    expect(visible).toHaveLength(1);
  });

  it('condo_718 + professional + cam → visible (has maintenance)', () => {
    const features = featuresFor('condo_718', 'professional');
    const visible = getVisibleItems([operationsEntry!], 'cam', features);
    expect(visible).toHaveLength(1);
  });

  it('apartment + operations_plus + site_manager → visible (has work orders + amenities)', () => {
    const features = featuresFor('apartment', 'operations_plus');
    const visible = getVisibleItems([operationsEntry!], 'site_manager', features);
    expect(visible).toHaveLength(1);
  });

  it('apartment + operations_plus + resident → visible (has amenities)', () => {
    const features = featuresFor('apartment', 'operations_plus');
    const visible = getVisibleItems([operationsEntry!], 'resident', features);
    expect(visible).toHaveLength(1);
  });

  it('hoa_720 + professional + board_president → visible', () => {
    const features = featuresFor('hoa_720', 'professional');
    const visible = getVisibleItems([operationsEntry!], 'board_president', features);
    expect(visible).toHaveLength(1);
  });

  it('hides Operations when ALL three features are disabled', () => {
    const features = {
      ...featuresFor('condo_718', 'professional'),
      hasMaintenanceRequests: false,
      hasWorkOrders: false,
      hasAmenities: false,
    };
    const visible = getVisibleItems([operationsEntry!], 'cam', features);
    expect(visible).toHaveLength(0);
  });

  it('shows Operations when only hasAmenities is true (amenity-only resident)', () => {
    const features = {
      ...featuresFor('condo_718', 'professional'),
      hasMaintenanceRequests: false,
      hasWorkOrders: false,
      hasAmenities: true,
    };
    const visible = getVisibleItems([operationsEntry!], 'resident', features);
    expect(visible).toHaveLength(1);
  });
});
