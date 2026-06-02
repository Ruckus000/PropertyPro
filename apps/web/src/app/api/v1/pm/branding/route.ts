/**
 * P3-47: White-label branding API for property managers.
 *
 * GET  /api/v1/pm/branding?communityId=X  — read current branding
 * PATCH /api/v1/pm/branding               — update branding (partial)
 *
 * Authorization: caller must hold property_manager_admin in the target community.
 *
 * Logo processing:
 *   The client uploads the raw file via POST /api/v1/upload (presigned URL).
 *   On PATCH the API server fetches those raw bytes from Supabase Storage,
 *   processes them through sharp (resize 400×400, WebP q80), and re-uploads
 *   to the canonical path communities/{id}/branding/logo.webp before persisting.
 */
import { NextResponse, type NextRequest } from 'next/server';
import { z } from 'zod';
import { ALLOWED_FONTS } from '@propertypro/theme';
import { createPresignedDownloadUrl, createPresignedUploadUrl, logAuditEvent } from '@propertypro/db';
import { withErrorHandler } from '@/lib/api/error-handler';
import { ForbiddenError, ValidationError } from '@/lib/api/errors';
import { requireAuthenticatedUserId } from '@/lib/api/auth';
import { requireCommunityMembership } from '@/lib/api/community-membership';
import { resolveEffectiveCommunityId } from '@/lib/api/tenant-context';
import { formatZodErrors } from '@/lib/api/zod/error-formatter';
import { getBrandingForCommunity, updateBrandingForCommunity } from '@/lib/api/branding';
import { requirePlanFeature } from '@/lib/middleware/plan-guard';
import { assertNotDemoGrace } from '@/lib/middleware/demo-grace-guard';
import { resizeLogo } from '@/lib/services/image-processor';
import { tryAutoComplete } from '@/lib/services/onboarding-checklist-service';

const PRESIGN_TTL_SECONDS = 60 * 60; // 1 hour for logo read
const HEX_RE = /^#[0-9a-fA-F]{6}$/;
const allowedFontsArray = ALLOWED_FONTS as readonly string[];

const hexColor = z.string().regex(HEX_RE, 'Must be a 6-digit hex color');
const allowedFont = z
  .string()
  .refine((v) => allowedFontsArray.includes(v), { message: 'Must be an allowed font family' });

// PR #11 — Pro+ custom CSS overrides. `.strict()` is the sanitization
// boundary: only these four validated token fields are accepted. Any unknown
// key (a raw-CSS string, a selector, a class name) is rejected with a 400 —
// there is no arbitrary-CSS path.
const customCssOverridesSchema = z
  .object({
    primaryColor: hexColor.optional(),
    secondaryColor: hexColor.optional(),
    accentColor: hexColor.optional(),
    bodyFont: allowedFont.optional(),
  })
  .strict();

const patchSchema = z.object({
  communityId: z.number().int().positive(),
  primaryColor: hexColor.optional(),
  secondaryColor: hexColor.optional(),
  accentColor: hexColor.optional(),
  fontHeading: allowedFont.optional(),
  fontBody: allowedFont.optional(),
  /** Raw Supabase Storage path of the user-uploaded image (pre-processing) */
  logoStoragePath: z.string().min(1).max(500).optional(),
  /** Custom footer text for outbound emails */
  customEmailFooter: z.string().max(500).optional(),
  /** Pro+ token-allowlist overrides; null clears them. Gated at write. */
  customCssOverrides: customCssOverridesSchema.nullable().optional(),
});

export const GET = withErrorHandler(async (req: NextRequest) => {
  const userId = await requireAuthenticatedUserId();
  const { searchParams } = new URL(req.url);
  const rawCommunityId = Number(searchParams.get('communityId'));

  if (!Number.isInteger(rawCommunityId) || rawCommunityId <= 0) {
    throw new ValidationError('communityId must be a positive integer');
  }

  const communityId = resolveEffectiveCommunityId(req, rawCommunityId);
  const membership = await requireCommunityMembership(communityId, userId);
  if (membership.role !== 'pm_admin') {
    throw new ForbiddenError('Only property managers can access branding settings');
  }

  const branding = await getBrandingForCommunity(communityId);
  return NextResponse.json({ data: branding ?? {} });
});

export const PATCH = withErrorHandler(async (req: NextRequest) => {
  const userId = await requireAuthenticatedUserId();
  const body: unknown = await req.json();
  const parseResult = patchSchema.safeParse(body);

  if (!parseResult.success) {
    throw new ValidationError('Invalid branding payload', {
      fields: formatZodErrors(parseResult.error),
    });
  }

  const {
    communityId: rawCommunityId,
    primaryColor,
    secondaryColor,
    accentColor,
    fontHeading,
    fontBody,
    logoStoragePath,
    customEmailFooter,
    customCssOverrides,
  } = parseResult.data;

  const communityId = resolveEffectiveCommunityId(req, rawCommunityId);
  await assertNotDemoGrace(communityId);
  const membership = await requireCommunityMembership(communityId, userId);
  if (membership.role !== 'pm_admin') {
    throw new ForbiddenError('Only property managers can update branding settings');
  }

  // PR #11 — custom CSS overrides are a Pro+ feature. Gate only when the
  // payload touches them, so the rest of the branding PATCH (colors, fonts,
  // logo) stays available to every tier. 403 PLAN_UPGRADE_REQUIRED otherwise.
  if (customCssOverrides !== undefined) {
    await requirePlanFeature(communityId, 'hasSiteCustomCss');
  }

  // Process logo if a raw upload path was provided
  let canonicalLogoPath: string | undefined;
  if (logoStoragePath) {
    // Fetch raw bytes from Supabase Storage
    const rawSignedUrl = await createPresignedDownloadUrl('documents', logoStoragePath, PRESIGN_TTL_SECONDS);
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL ?? '';
    const signedUrl = rawSignedUrl.startsWith('http')
      ? rawSignedUrl
      : new URL(rawSignedUrl, supabaseUrl).toString();
    const res = await fetch(signedUrl);
    if (!res.ok) {
      throw new ValidationError('Could not fetch uploaded logo from storage');
    }
    const rawBuffer = Buffer.from(await res.arrayBuffer());

    // Validate file type via magic bytes (not just Content-Type header)
    const { fileTypeFromBuffer } = await import('file-type');
    const detectedType = await fileTypeFromBuffer(rawBuffer);
    const ALLOWED_LOGO_MIMES = ['image/png', 'image/jpeg', 'image/webp'] as const;
    if (!detectedType || !(ALLOWED_LOGO_MIMES as readonly string[]).includes(detectedType.mime)) {
      throw new ValidationError('Invalid image file: only PNG, JPEG, and WebP are accepted');
    }

    // Process: resize to 400×400, convert to WebP
    const processedBuffer = await resizeLogo(rawBuffer);

    // Re-upload to canonical path
    canonicalLogoPath = `communities/${communityId}/branding/logo.webp`;
    const signedUpload = await createPresignedUploadUrl('documents', canonicalLogoPath, {
      upsert: true,
    });
    const uploadUrl = signedUpload.signedUrl.startsWith('http')
      ? signedUpload.signedUrl
      : new URL(signedUpload.signedUrl, supabaseUrl).toString();

    const uploadRes = await fetch(uploadUrl, {
      method: 'PUT',
      headers: { 'content-type': 'image/webp' },
      // Cast Buffer → Uint8Array for BodyInit compatibility
      body: new Uint8Array(processedBuffer),
    });
    if (!uploadRes.ok) {
      throw new ValidationError('Failed to save processed logo');
    }
  }

  const updated = await updateBrandingForCommunity(communityId, {
    ...(primaryColor !== undefined && { primaryColor }),
    ...(secondaryColor !== undefined && { secondaryColor }),
    ...(accentColor !== undefined && { accentColor }),
    ...(fontHeading !== undefined && { fontHeading }),
    ...(fontBody !== undefined && { fontBody }),
    ...(canonicalLogoPath !== undefined && { logoPath: canonicalLogoPath }),
    ...(customEmailFooter !== undefined && { customEmailFooter }),
    ...(customCssOverrides !== undefined && { customCssOverrides }),
  });

  await logAuditEvent({
    userId,
    action: 'settings_changed',
    resourceType: 'community',
    resourceId: String(communityId),
    communityId,
    newValues: updated as Record<string, unknown>,
  });

  void tryAutoComplete(communityId, userId, 'customize_portal');

  return NextResponse.json({ data: updated });
});
