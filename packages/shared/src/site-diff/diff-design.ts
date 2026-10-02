import type { SiteLook } from '../branding';
import type { Change } from './types';

/**
 * The publish-sheet entry for a drafted look (`communities.branding.draftLook`
 * — website builder v4). One change for the whole look, not one per field: a
 * template switch moves layout, colours and fonts together, and the PM chose
 * it as one thing.
 *
 * `draft` is the pending look (`pendingLook`), so an empty object — or a draft
 * changed back to the live look — produces nothing.
 */
export function diffDesign(draft: SiteLook, group: string): Change[] {
  if (Object.keys(draft).length === 0) return [];
  return [
    {
      key: 'style',
      kind: 'edited',
      group,
      title: 'Site design (template, colours and fonts)',
      blockType: null,
      fromSlot: null,
      toSlot: null,
    },
  ];
}
