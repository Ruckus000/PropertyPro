'use client';

import type { BlockFormProps } from '../types';
import {
  announcementsHref,
  communityProfileHref,
  documentsHref,
  meetingsHref,
} from '../source-links';
import { SourceLink } from './fields/SourceLink';

/**
 * Quick links settings: there are none, so this explains the section.
 *
 * The block stores nothing but `hidden` (`quicklinksBlockSchema` is `.strict()`),
 * and the Sections list's eye toggle owns that. Which links appear, and where each
 * one points, is decided when the page renders (`QuickLinksBlock`): Meetings, News
 * and Contact show only when the page's own section of that kind is there and has
 * something to show, and Owner documents always shows because it is where owners
 * sign in. A stored link list would be a second place for a target to go stale, so
 * this form does not offer one. It only reads the community id, to link to where each
 * shortcut's content comes from: with no draft there is no autosave and no save to fail.
 */
export function QuickLinksForm({ communityId }: BlockFormProps) {
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
      <div className="space-y-1.5">
        <h3 className="text-sm font-medium text-content">Where each shortcut comes from</h3>
        <ul className="space-y-1.5 text-sm">
          <li>
            <SourceLink href={meetingsHref(communityId)}>Meetings</SourceLink>
          </li>
          <li>
            <SourceLink href={announcementsHref(communityId)}>Announcements</SourceLink>
          </li>
          <li>
            <SourceLink href={documentsHref(communityId)}>Documents</SourceLink>
          </li>
          <li>
            <SourceLink href={communityProfileHref(communityId)}>Community profile</SourceLink>{' '}
            <span className="text-content-secondary">(contact details)</span>
          </li>
        </ul>
      </div>
    </div>
  );
}
