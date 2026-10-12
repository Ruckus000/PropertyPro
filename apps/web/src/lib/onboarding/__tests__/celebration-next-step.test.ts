import { describe, expect, it } from 'vitest';
import type { CommunityRole, CommunityType } from '@propertypro/shared';
import { celebrationNextStepFor, chooseCelebrationNextStep } from '../celebration-next-step';

const CID = 7;

/** What both dashboards call, against the REAL permission matrix and features. */
function nextStepFor(role: CommunityRole, communityType: CommunityType, isUnitOwner: boolean) {
  return celebrationNextStepFor({ communityId: CID, role, communityType, isUnitOwner });
}

describe('celebrationNextStepFor', () => {
  it('sends a condo owner to compliance, which they may read', () => {
    expect(nextStepFor('resident', 'condo_718', true)).toEqual({
      label: 'View compliance dashboard',
      href: `/communities/${CID}/compliance`,
    });
  });

  it('sends a condo manager to compliance', () => {
    expect(nextStepFor('property_manager', 'hoa_720', false)?.href).toBe(
      `/communities/${CID}/compliance`,
    );
  });

  it('sends a condo tenant to documents: tenants cannot read compliance', () => {
    expect(nextStepFor('resident', 'condo_718', false)).toEqual({
      label: 'Browse documents',
      href: `/communities/${CID}/documents`,
    });
  });

  it('sends an apartment manager to documents: apartments have no compliance', () => {
    expect(nextStepFor('root_manager', 'apartment', false)?.href).toBe(
      `/communities/${CID}/documents`,
    );
  });

  it('sends an apartment resident to documents', () => {
    expect(nextStepFor('resident', 'apartment', false)?.href).toBe(
      `/communities/${CID}/documents`,
    );
  });

  it('offers no link when neither is permitted', () => {
    expect(
      chooseCelebrationNextStep({ communityId: CID, canViewCompliance: false, canViewDocuments: false }),
    ).toBeNull();
  });
});
