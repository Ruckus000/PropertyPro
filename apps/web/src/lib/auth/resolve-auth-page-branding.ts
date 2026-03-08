/**
 * Resolves community branding for auth pages (login, forgot-password, etc.).
 *
 * When a user visits a community subdomain's auth page, this fetches the
 * community's name, logo, and theme so the page can render branded UI.
 * Falls back to generic PropertyPro branding on any error.
 */
import { headers } from 'next/headers';
import { resolveTheme, toCssVars, toFontLinks } from '@propertypro/theme';
import type { CommunityTheme } from '@propertypro/theme';
import { COMMUNITY_TYPES } from '@propertypro/shared';
import { getCommunityPublicInfo, getBrandingForCommunity } from '@/lib/api/branding';
import { createPresignedDownloadUrl } from '@propertypro/db';

export interface AuthPageBranding {
  communityName: string | null;
  communitySlug: string | null;
  /** Presigned download URL (time-limited) — NOT a storage path */
  logoUrl: string | null;
  theme: CommunityTheme;
  cssVars: Record<string, string>;
  fontLinks: string[];
  hasTenantContext: boolean;
}

const GENERIC_BRANDING: AuthPageBranding = (() => {
  const theme = resolveTheme(null, '', 'condo_718');
  return {
    communityName: null,
    communitySlug: null,
    logoUrl: null,
    theme,
    cssVars: toCssVars(theme),
    fontLinks: toFontLinks(theme),
    hasTenantContext: false,
  };
})();

/** Allowed image extensions for logo presigned URLs (prevents IDOR on non-image files). */
const ALLOWED_LOGO_EXTENSIONS = ['.png', '.jpg', '.jpeg', '.gif', '.svg', '.webp', '.ico'];

function isAllowedLogoPath(path: string): boolean {
  const lower = path.toLowerCase();
  return ALLOWED_LOGO_EXTENSIONS.some((ext) => lower.endsWith(ext));
}

export async function resolveAuthPageBranding(): Promise<AuthPageBranding> {
  const requestHeaders = await headers();
  const communityIdStr = requestHeaders.get('x-community-id');

  if (!communityIdStr) {
    return GENERIC_BRANDING;
  }

  try {
    const communityId = Number(communityIdStr);
    // Fetch in parallel — reuse existing functions from branding.ts
    const [info, branding] = await Promise.all([
      getCommunityPublicInfo(communityId),
      getBrandingForCommunity(communityId),
    ]);

    const name = info?.name ?? null;
    const slug = info?.slug ?? null;
    const communityType = info?.communityType;
    const type =
      communityType && (COMMUNITY_TYPES as readonly string[]).includes(communityType)
        ? (communityType as (typeof COMMUNITY_TYPES)[number])
        : 'condo_718';

    // Generate presigned download URL for logo if it exists.
    // Security: only allow image file extensions to prevent IDOR on sensitive documents.
    let logoUrl: string | null = null;
    if (branding?.logoPath && isAllowedLogoPath(branding.logoPath)) {
      try {
        logoUrl = await createPresignedDownloadUrl('documents', branding.logoPath);
      } catch {
        // Non-fatal — show branded page without logo rather than crash
      }
    }

    // Pass logoUrl into branding so resolveTheme picks it up
    const brandingForTheme = branding ? { ...branding, logoUrl } : null;
    const theme = resolveTheme(brandingForTheme, name ?? '', type);

    return {
      communityName: name,
      communitySlug: slug,
      logoUrl,
      theme,
      cssVars: toCssVars(theme),
      fontLinks: toFontLinks(theme),
      hasTenantContext: true,
    };
  } catch (error) {
    console.error('[resolveAuthPageBranding] Failed to resolve branding, falling back to generic:', error);
    // If DB is down or community lookup fails, fall back to generic branding.
    // Login must NEVER crash — a broken branding fetch should not block authentication.
    return { ...GENERIC_BRANDING, hasTenantContext: true };
  }
}
