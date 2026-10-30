/**
 * Where a section's content comes from, as links.
 *
 * The inspector's panels tell a manager where a section gets what it shows
 * (Announcements, Meetings, Documents, the Community profile, board seats) and
 * send them there. The addresses are written out here rather than read from
 * `layout/nav-config.ts`, whose icon imports would travel into a form's chunk;
 * `source-links.test.ts` compares each one with the nav config so they cannot
 * drift apart.
 *
 * Pure strings, no imports.
 */

/** The announcements list. */
export const announcementsHref = (communityId: number): string =>
  `/announcements?communityId=${communityId}`;

/** The form that writes a new announcement. */
export const newAnnouncementHref = (communityId: number): string =>
  `/announcements/new?communityId=${communityId}`;

/** The meetings list. */
export const meetingsHref = (communityId: number): string => `/communities/${communityId}/meetings`;

/** The document library. */
export const documentsHref = (communityId: number): string =>
  `/communities/${communityId}/documents`;

/** The website home's list of the records the website shows or still lacks. */
export const websiteRecordsHref = (communityId: number): string =>
  `/pm/website?communityId=${communityId}#records`;

/** The Community profile section of Settings (ruling R10). */
export const communityProfileHref = (communityId: number): string =>
  `/settings?communityId=${communityId}#community-profile`;

/** Roles & Access, where board seats are given out. */
export const rolesAccessHref = (communityId: number): string =>
  `/settings/roles?communityId=${communityId}`;
