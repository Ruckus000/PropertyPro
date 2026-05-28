/**
 * Resolves a `LayoutId` for a community from `communities.branding.layoutId`
 * with community-type and Tidewater fallbacks. Consumed by `_site/page.tsx`
 * (Task 7 of PR #1b) and by the PM editor (Task 15) to pre-select the
 * current layout in the UI.
 */
import { LAYOUT_IDS, type LayoutId } from '@/components/public-site/layouts/types';
import { type CommunityType } from '@propertypro/shared';

function isLayoutId(v: unknown): v is LayoutId {
  return typeof v === 'string' && (LAYOUT_IDS as readonly string[]).includes(v);
}

const COMMUNITY_TYPE_DEFAULT: Record<CommunityType, LayoutId> = {
  condo_718: 'tidewater',
  hoa_720: 'boulevard',
  apartment: 'sable',
};

export interface BrandingLayoutInput {
  layoutId?: string | null;
}

export function resolveLayoutId(
  branding: BrandingLayoutInput | null | undefined,
  communityType: CommunityType,
): LayoutId {
  if (branding && isLayoutId(branding.layoutId)) {
    return branding.layoutId;
  }
  // Defensive default: if a new community_type is added before its layout
  // mapping ships, render Tidewater rather than 500 the public site.
  return COMMUNITY_TYPE_DEFAULT[communityType] ?? 'tidewater';
}
