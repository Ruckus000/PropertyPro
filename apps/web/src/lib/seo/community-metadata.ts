import type { Metadata } from 'next';
import { buildCommunityUrl } from '@/lib/utils/community-url';
import { buildPublicAssetUrl } from '@/lib/site-assets/public-url';
import {
  DEFAULT_SITE_SETTINGS,
  resolveSeoDescription,
  resolveSeoTitle,
  type SiteSettings,
} from '@/lib/site-editor/site-settings';

export interface CommunityMetadataInput {
  id: number;
  slug: string;
  name: string;
  communityType: 'condo_718' | 'hoa_720' | 'apartment';
  city?: string | null;
  tagline?: string | null;
  /** Fully-qualified URL to the hero image (1600×900 recommended). */
  heroImageUrl?: string | null;
  /**
   * Website editor v3, Phase 8 — the PM's overrides.
   *
   * Omit for the derived-everything behaviour. Callers should pass the output
   * of `resolveSiteSettings(branding)`, which is total: it never throws, so a
   * community with a malformed `branding` column gets the default metadata
   * rather than a 500 on a statutory public page.
   */
  siteSettings?: SiteSettings;
}

export function buildCommunityMetadata(community: CommunityMetadataInput): Metadata {
  const settings = community.siteSettings ?? DEFAULT_SITE_SETTINGS;

  // The fallback chain lives in `site-editor/site-settings` so the editor's
  // SERP preview renders from the same function that produces the real tags. A
  // preview that quietly disagrees with what ships is worse than no preview.
  const title = resolveSeoTitle(settings, community);
  const description = resolveSeoDescription(settings, community, community.tagline);

  const url = buildCommunityUrl(community.slug, '/');
  const images = community.heroImageUrl
    ? [{ url: community.heroImageUrl, width: 1600, height: 900, alt: community.name }]
    : [];

  // Absent settings, and anything other than an explicit opt-out, stay
  // indexable. Getting this default wrong de-indexes every community at once,
  // silently, and costs months of recrawl to undo — see the tests, which pin
  // the unset / null / garbage cases as much as the false case.
  const robots = settings.searchIndexing
    ? { index: true, follow: true }
    : { index: false, follow: false };

  const icons = settings.favicon
    ? {
        icon: [
          {
            url: buildPublicAssetUrl(settings.favicon.icon32Path),
            sizes: '32x32',
            type: 'image/png',
          },
        ],
        apple: [
          {
            url: buildPublicAssetUrl(settings.favicon.appleTouch180Path),
            sizes: '180x180',
            type: 'image/png',
          },
        ],
      }
    : undefined;

  return {
    title,
    description,
    openGraph: {
      // The social card shows the PM's title when they set one, and the bare
      // community name otherwise — "Sunset Condos — Community Portal" reads as
      // boilerplate in a share preview.
      title: settings.seoTitle ?? community.name,
      description,
      url,
      siteName: community.name,
      images,
      locale: 'en_US',
      type: 'website',
    },
    twitter: {
      card: images.length > 0 ? 'summary_large_image' : 'summary',
      title: settings.seoTitle ?? community.name,
      description,
    },
    robots,
    ...(icons ? { icons } : {}),
  };
}
