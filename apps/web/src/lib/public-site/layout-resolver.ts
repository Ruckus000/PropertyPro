import type { LayoutId } from '@/components/public-site/layouts/types';

const LAYOUT_IDS: readonly LayoutId[] = ['tidewater', 'boulevard', 'sable'] as const;

function isLayoutId(v: unknown): v is LayoutId {
  return typeof v === 'string' && (LAYOUT_IDS as readonly string[]).includes(v);
}

const COMMUNITY_TYPE_DEFAULT: Record<string, LayoutId> = {
  condo_718: 'tidewater',
  hoa_720: 'boulevard',
  apartment: 'sable',
};

export interface BrandingLayoutInput {
  layoutId?: string | null;
}

export function resolveLayoutId(
  branding: BrandingLayoutInput | null | undefined,
  communityType: string,
): LayoutId {
  if (branding && isLayoutId(branding.layoutId)) {
    return branding.layoutId;
  }
  return COMMUNITY_TYPE_DEFAULT[communityType] ?? 'tidewater';
}
