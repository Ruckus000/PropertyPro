'use client';

/**
 * B5 / ADR-003 layering: data-fetching hook drained out of
 * `apps/web/src/components/pm/BrandingForm.tsx`.
 *
 * Two-leg save flow:
 *  1. (optional) presign a logo upload via POST /api/v1/upload, then PUT the
 *     raw bytes to the external Supabase Storage signed URL.
 *  2. PATCH /api/v1/pm/branding with the storage path + colors + fonts.
 *
 * DOCUMENTED EXCEPTION to the requestJson() rule: the component renders thrown
 * `.message` strings verbatim, so the EXACT literals
 * 'Failed to prepare logo upload', 'Failed to upload logo', and the PATCH
 * `json.error?.message ?? 'Failed to save branding'` must be preserved. The
 * second leg also PUTs to an external (non-/api/v1) Supabase URL. Raw fetch is
 * kept throughout for these reasons; do not migrate to requestJson.
 */
import { useMutation } from '@tanstack/react-query';

interface PresignResponse {
  data: { path: string; uploadUrl: string };
}

export interface SaveBrandingInput {
  communityId: number;
  primaryColor: string;
  secondaryColor: string;
  accentColor: string;
  fontHeading: string;
  fontBody: string;
  customEmailFooter: string;
  /** A newly-selected logo file to upload, or null to leave the logo unchanged. */
  logoFile: File | null;
  /** A newly-cropped site (wordmark) logo to upload, or null to leave it unchanged. */
  siteLogoFile?: File | null;
}

async function uploadLogo(communityId: number, file: File): Promise<string> {
  const presignRes = await fetch('/api/v1/upload', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      communityId,
      fileName: file.name,
      fileSize: file.size,
      mimeType: file.type,
    }),
  });

  if (!presignRes.ok) {
    throw new Error('Failed to prepare logo upload');
  }

  const { data } = (await presignRes.json()) as PresignResponse;

  const uploadRes = await fetch(data.uploadUrl, {
    method: 'PUT',
    headers: { 'content-type': file.type },
    body: file,
  });

  if (!uploadRes.ok) {
    throw new Error('Failed to upload logo');
  }

  return data.path;
}

async function saveBranding(input: SaveBrandingInput): Promise<void> {
  const {
    communityId,
    primaryColor,
    secondaryColor,
    accentColor,
    fontHeading,
    fontBody,
    customEmailFooter,
    logoFile,
    siteLogoFile,
  } = input;

  let logoStoragePath: string | undefined;
  if (logoFile) {
    logoStoragePath = await uploadLogo(communityId, logoFile);
  }

  let siteLogoStoragePath: string | undefined;
  if (siteLogoFile) {
    siteLogoStoragePath = await uploadLogo(communityId, siteLogoFile);
  }

  const res = await fetch('/api/v1/pm/branding', {
    method: 'PATCH',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      communityId,
      primaryColor,
      secondaryColor,
      accentColor,
      fontHeading,
      fontBody,
      customEmailFooter: customEmailFooter || undefined,
      ...(logoStoragePath !== undefined && { logoStoragePath }),
      ...(siteLogoStoragePath !== undefined && { siteLogoStoragePath }),
    }),
  });

  if (!res.ok) {
    // `.catch(() => ({}))`: a non-JSON error body (proxy/LB HTML) must
    // still surface the intended 'Failed to save branding' literal, not a
    // raw SyntaxError.
    const json = (await res.json().catch(() => ({}))) as {
      error?: { message?: string };
    };
    throw new Error(json.error?.message ?? 'Failed to save branding');
  }
}

/**
 * Mutation hook performing the optional logo upload followed by the branding
 * PATCH. Throws on any non-OK response so `isError`/rejection is accurate.
 * DOM/navigation side-effects (success banner, clearing the file input) stay
 * in the component via the mutation's onSuccess callback.
 */
export function useSaveBranding() {
  return useMutation<void, Error, SaveBrandingInput>({
    mutationFn: saveBranding,
  });
}
