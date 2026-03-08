/**
 * Resolves community branding for auth pages (login, forgot-password, etc.).
 *
 * When middleware injects `x-community-id` (from a community subdomain or
 * query param), this helper fetches the community's branding and theme so
 * auth pages can display the community's logo, colours, and fonts.
 *
 * Error boundary: If the DB is unreachable or the community lookup fails,
 * we fall back to generic PropertyPro branding. Login must NEVER crash due
 * to a branding fetch failure.
 */
import { headers } from 'next/headers';
import { resolveTheme, toCssVars, toFontLinks } from '@propertypro/theme';
import type { CommunityTheme } from '@propertypro/theme';
import { createPresignedDownloadUrl } from '@propertypro/db';
import { getCommunityPublicInfo, getBrandingForCommunity } from '@/lib/api/branding';

export interface AuthPageBranding {
  communityName: string | null;
  communitySlug: string | null;
  /** Presigned download URL (time-limited) for the community logo. NOT a storage path. */
  logoUrl: string | null;
  theme: CommunityTheme;
  cssVars: Record<string, string>;
  fontLinks: string[];
  hasTenantContext: boolean;
}

/** Default branding when no tenant context is available. */
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

export async function resolveAuthPageBranding(): Promise<AuthPageBranding> {
  const requestHeaders = await headers();
  const communityIdStr = requestHeaders.get('x-community-id');

  if (!communityIdStr) {
    return GENERIC_BRANDING;
  }

  try {
    const communityId = Number(communityIdStr);

    // Fetch community info + branding in parallel — reuse existing helpers from branding.ts
    const [info, branding] = await Promise.all([
      getCommunityPublicInfo(communityId),
      getBrandingForCommunity(communityId),
    ]);

    const name = info?.name ?? null;
    const slug = info?.slug ?? null;
    const type = (info?.communityType as 'condo_718' | 'hoa_720' | 'apartment') ?? 'condo_718';

    // Generate presigned download URL for logo.
    // logoPath is a Supabase Storage path (e.g. "communities/123/documents/uuid/logo.webp")
    // stored in the private "documents" bucket — must generate a signed URL for rendering.
    let logoUrl: string | null = null;
    if (branding?.logoPath) {
      try {
        logoUrl = await createPresignedDownloadUrl('documents', branding.logoPath);
      } catch {
        // Non-fatal — show branded page without logo rather than crash
      }
    }

    // resolveTheme expects branding.logoUrl (not logoPath) for the CommunityTheme
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
  } catch {
    // If DB is down or community lookup fails, fall back to generic branding.
    // Login must NEVER crash — a broken branding fetch should not block authentication.
    // Preserve hasTenantContext: true so post-login routing still works correctly.
    return { ...GENERIC_BRANDING, hasTenantContext: true };
  }
}
