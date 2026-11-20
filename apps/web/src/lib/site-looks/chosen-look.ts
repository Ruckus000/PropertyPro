/**
 * The look the editor treats as chosen: the drafted layout's look when a
 * different layout is drafted, else the live layout's. Pure (no DB import) so
 * LookChooser and the photo picker agree on it.
 */
import type { SiteDesignRecord } from '@/hooks/use-site-design';
import { lookIdForLayout, type LookId } from './looks';

export function chosenLookId(design: SiteDesignRecord): LookId | null {
  const live = design.live.layoutId;
  const drafted = design.draft.layoutId;
  if (drafted && drafted !== live) return lookIdForLayout(drafted);
  return lookIdForLayout(live);
}
