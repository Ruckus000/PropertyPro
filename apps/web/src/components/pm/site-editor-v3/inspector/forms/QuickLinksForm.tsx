'use client';

import type { BlockFormProps } from '../types';

/**
 * Quick links settings: there are none, so this explains the section.
 *
 * The block stores nothing but `hidden` (`quicklinksBlockSchema` is `.strict()`),
 * and the Sections list's eye toggle owns that. Which links appear, and where each
 * one points, is decided when the page renders (`QuickLinksBlock`): Meetings, News
 * and Contact show only when the page's own section of that kind is there and has
 * something to show, and Owner documents always shows because it is where owners
 * sign in. A stored link list would be a second place for a target to go stale, so
 * this form does not offer one. It reads none of its props: with no draft there is
 * no autosave and no save to fail.
 */
export function QuickLinksForm(_props: BlockFormProps) {
  return (
    <div className="space-y-3">
      <p className="text-sm text-content-secondary">
        Quick links fills itself in from your meetings, announcements (shown as News), owner
        documents and contact details, so there is nothing to set up here.
      </p>
      <p className="text-sm text-content-secondary">
        On your website, a shortcut appears only when its section is on the page and has
        something to show. Owner documents always appears, because it is where owners sign in.
      </p>
    </div>
  );
}
