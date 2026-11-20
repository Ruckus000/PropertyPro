'use client';

import { chosenLookId } from '@/lib/site-looks/chosen-look';
import type { LookId } from '@/lib/site-looks/looks';
import { useSiteDesign } from './use-site-design';

/** The look the editor treats as chosen; null while loading, on error, or for a legacy layout. */
export function useChosenLookId(communityId: number): LookId | null {
  const design = useSiteDesign(communityId);
  return design.data ? chosenLookId(design.data) : null;
}
