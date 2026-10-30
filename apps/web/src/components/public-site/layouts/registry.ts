/**
 * Layout component registry — maps LayoutId to the React server component
 * that renders the page for that layout.
 *
 * Empty in PR #1a. Populated:
 *   - PR #1b: tidewater
 *   - PR #7: boulevard, sable
 *   - website builder Phase 2B: the four looks (bayfront, heritage, palm-grove,
 *     plain-simple); a look's layout id is its look id (D2)
 *
 * The default layout for a community is resolved from
 * communities.branding.layoutId; if no entry exists, falls back to
 * community_type → layout default (condo_718 → tidewater, etc.).
 */
import type { LayoutId, LayoutComponent } from './types';
import { Tidewater } from './Tidewater';
import { Boulevard } from './Boulevard';
import { Sable } from './Sable';
import { Bayfront } from './Bayfront';
import { Heritage } from './Heritage';
import { PalmGrove } from './PalmGrove';
import { PlainSimple } from './PlainSimple';

export const layoutRegistry: Partial<Record<LayoutId, LayoutComponent>> = {
  tidewater: Tidewater,
  boulevard: Boulevard,
  sable: Sable,
  bayfront: Bayfront,
  heritage: Heritage,
  'palm-grove': PalmGrove,
  'plain-simple': PlainSimple,
};

/**
 * Returns the layout component for the given id, or undefined if the
 * layout is not yet implemented. Callers must handle the undefined case
 * (typically by falling back to the hardcoded current renderer in PR #1a;
 * after PR #1b lands, by falling back to tidewater).
 */
export function getLayout(id: LayoutId): LayoutComponent | undefined {
  return layoutRegistry[id];
}
