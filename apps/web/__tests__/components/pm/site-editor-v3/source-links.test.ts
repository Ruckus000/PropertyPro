/**
 * The section panels' links are written out in `source-links.ts` so a form's
 * chunk does not carry the nav config's icons. This ties each one to the nav
 * config, so a moved page cannot leave a panel pointing at the old address.
 */
import { describe, expect, it } from 'vitest';
import { NAV_ITEMS } from '@/components/layout/nav-config';
import {
  announcementsHref,
  communityProfileHref,
  documentsHref,
  meetingsHref,
  newAnnouncementHref,
  rolesAccessHref,
  websiteRecordsHref,
} from '@/components/pm/site-editor-v3/inspector/source-links';

function navHref(id: string, communityId: number): string {
  const item = NAV_ITEMS.find((candidate) => candidate.id === id);
  expect(item, `${id} is in the nav`).toBeDefined();
  return item!.href(communityId);
}

describe('source links', () => {
  it.each([
    ['announcements', announcementsHref],
    ['meetings', meetingsHref],
    ['documents', documentsHref],
  ])('%s: the address the sidebar uses', (id, href) => {
    expect(href(7)).toBe(navHref(id, 7));
    expect(href(31)).toBe(navHref(id, 31));
  });

  it('points at the community it is given', () => {
    expect(newAnnouncementHref(7)).toBe('/announcements/new?communityId=7');
    expect(websiteRecordsHref(7)).toBe('/pm/website?communityId=7#records');
    expect(communityProfileHref(7)).toBe('/settings?communityId=7#community-profile');
    expect(rolesAccessHref(7)).toBe('/settings/roles?communityId=7');
  });
});
