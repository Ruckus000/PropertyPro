/**
 * Server-side loader for everything the editor canvas needs to render.
 *
 * Deliberately mirrors `app/public-site/page.tsx` — the canvas's whole promise
 * is that what you see is what publishes, so the community shape, theme
 * resolution, layout choice and logo presigning all have to be resolved the
 * same way. When that page changes, this changes with it.
 *
 * Runs once per page load, on the server. The system-of-record rows come back
 * as one generous superset per type; the canvas narrows them in memory as the
 * PM edits block config, so no request fires per keystroke. See
 * `./preview-data.ts` for where that is exact and where it approximates.
 */
import { DOCUMENT_CATEGORIES, type CommunityType } from '@propertypro/shared';
import { resolveTheme } from '@propertypro/theme';
import { createPresignedDownloadUrl } from '@propertypro/db';
import { getBrandingForCommunity, getCommunityPublicInfo } from '@/lib/api/branding';
import { getPublicCommunityScopedReader } from '@/lib/db/public-community-reader';
import { resolveLayoutId } from '@/lib/public-site/layout-resolver';
import { sanitizeHtml } from '@/lib/utils/html-sanitizer';
import type { LayoutId, PublicCommunity, ResolvedTheme } from '@/components/public-site/blocks/types';
import {
  PREVIEW_LIMIT,
  PREVIEW_WINDOW_DAYS,
  type CanvasPreviewData,
} from './preview-data';

export interface CanvasContext {
  community: PublicCommunity;
  theme: ResolvedTheme;
  layout: LayoutId;
  preview: CanvasPreviewData;
}

export async function loadCanvasContext(communityId: number): Promise<CanvasContext | null> {
  const community = await getCommunityPublicInfo(communityId);
  if (!community) return null;

  const rawBranding = await getBrandingForCommunity(communityId);

  // resolveTheme reads `branding.logoUrl`, but the stored field is `logoPath`
  // (a Storage object key). Passing raw branding yields a null logo and a
  // silently text-only header — presign first, exactly as the public page does.
  let logoUrl: string | null = null;
  if (rawBranding?.logoPath) {
    try {
      logoUrl = await createPresignedDownloadUrl('documents', rawBranding.logoPath);
    } catch {
      // Non-fatal — preview without a logo rather than fail the editor.
    }
  }
  let siteLogoUrl: string | null = null;
  if (rawBranding?.siteLogoPath) {
    try {
      siteLogoUrl = await createPresignedDownloadUrl('documents', rawBranding.siteLogoPath);
    } catch {
      // Non-fatal — fall back to the square logo / text.
    }
  }

  const branding = rawBranding ? { ...rawBranding, logoUrl } : null;
  const communityType = community.communityType as CommunityType;
  const resolved = resolveTheme(branding, community.name, communityType);

  const reader = getPublicCommunityScopedReader(communityId);
  const [announcements, documents, meetings, contact] = await Promise.all([
    reader.listAnnouncements({ limit: PREVIEW_LIMIT, timeWindowDays: PREVIEW_WINDOW_DAYS }),
    // ALL categories, explicitly. `listDocuments` returns [] when the category
    // list is empty — omitting it here would make the superset permanently
    // empty and the documents block preview permanently blank. The block's own
    // category selection is applied later by `selectDocuments`.
    reader.listDocuments({ limit: PREVIEW_LIMIT, includeCategories: [...DOCUMENT_CATEGORIES] }),
    reader.listMeetings({ limit: PREVIEW_LIMIT, timeWindowDays: PREVIEW_WINDOW_DAYS }),
    reader.getContactInfo({ showBoard: true, showManagement: true }),
  ]);

  return {
    community: {
      id: community.id,
      slug: community.slug,
      name: community.name,
      logoUrl: siteLogoUrl ?? resolved.logoUrl,
      communityType: community.communityType as PublicCommunity['communityType'],
      // Not yet in getCommunityPublicInfo; the public page makes the same
      // assumption. Both change together when that SELECT is widened.
      city: null,
      state: null,
      timezone: 'America/New_York',
    },
    theme: {
      primaryColor: resolved.primaryColor,
      secondaryColor: resolved.secondaryColor,
      accentColor: resolved.accentColor,
      headingFont: resolved.fontHeading,
      bodyFont: resolved.fontBody,
    },
    layout: resolveLayoutId(branding, communityType) as LayoutId,
    preview: {
      // Sanitized here, on the server, for the same reason the public shell
      // does it: isomorphic-dompurify pulls jsdom behind it and must not reach
      // the editor's client bundle. See AnnouncementViewItem.
      announcements: announcements.map((a) => ({ ...a, bodyHtml: sanitizeHtml(a.body ?? '') })),
      documents,
      meetings,
      contact,
    },
  };
}
