/**
 * POST /api/admin/upload — Admin image upload for site blocks and community assets.
 *
 * Protected by requirePlatformAdmin(). Validates file size, MIME type via
 * magic bytes, and uploads to Supabase Storage.
 *
 * Storage path: community-assets/{communityId}/site/{uuid}.{ext}
 */
import { NextResponse, type NextRequest } from 'next/server';
import { randomUUID } from 'crypto';
import { requirePlatformAdmin } from '@/lib/auth/platform-admin';
import { createAdminClient } from '@propertypro/db/supabase/admin';
// From @propertypro/db/constants, NOT the root barrel: the barrel pulls in
// drizzle.ts, which throws at module load without DATABASE_URL.
import { COMMUNITY_ASSETS_BUCKET } from '@propertypro/db/constants';
import { withAdminErrorHandler } from '@/lib/api/with-error-handler';
import { assertNoDbError } from '@/lib/api/assert-no-db-error';
import { logAdminAction } from '@/lib/audit/log-admin-action';

const MAX_FILE_SIZE = 5 * 1024 * 1024; // 5 MB

/**
 * SVG is deliberately NOT accepted.
 *
 * Uploads land in the PUBLIC `community-assets` bucket and are handed back as
 * a `getPublicUrl`. An SVG served from that origin with `image/svg+xml`
 * executes any `<script>` or `onload=` it contains — stored XSS on the bucket
 * origin, with nothing sanitising it.
 *
 * Nothing was ever uploading SVG: both callers
 * (`components/demo/BrandingFormFields.tsx`, `components/clients/CommunityWebsiteEditor.tsx`)
 * already restrict their file pickers to `image/png,image/jpeg,image/webp`.
 * This was dead surface with a live risk.
 *
 * Re-adding SVG requires a real sanitiser AND
 * `Content-Disposition: attachment` — not just putting the MIME back.
 */
const ALLOWED_MIME_TYPES = [
  'image/jpeg',
  'image/png',
  'image/webp',
] as const;

type AllowedMime = (typeof ALLOWED_MIME_TYPES)[number];

/** Magic byte signatures for allowed image types */
const MAGIC_BYTES: Array<{
  mime: AllowedMime;
  bytes: number[];
  offset?: number;
  /** A second byte run that must ALSO match (container formats). */
  alsoRequire?: { offset: number; bytes: number[] };
}> = [
  { mime: 'image/png', bytes: [0x89, 0x50, 0x4e, 0x47] },
  { mime: 'image/jpeg', bytes: [0xff, 0xd8, 0xff] },
  // WebP is RIFF-containered: "RIFF" at 0, then a 4-byte size, then "WEBP" at
  // 8. Checking only the offset-8 marker would accept any file with arbitrary
  // leading bytes, which defeats the point of a strict sniff.
  { mime: 'image/webp', bytes: [0x52, 0x49, 0x46, 0x46], offset: 0, alsoRequire: { offset: 8, bytes: [0x57, 0x45, 0x42, 0x50] } },
];

const MIME_TO_EXT: Record<AllowedMime, string> = {
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
};


/**
 * Detect MIME type from magic bytes in a Uint8Array buffer.
 * Returns the matched MIME string, or null if the bytes are not a recognised
 * raster image — in which case the caller rejects the upload.
 *
 * This used to end with a text sniff that returned `image/svg+xml` when the
 * first 256 bytes merely contained `<svg` OR `<?xml`. That made it a
 * fallback-to-SVG rather than a detector: ANY text file with `<?xml` anywhere
 * near its start was accepted and stored with an executable content type.
 * Removing the SVG entry from ALLOWED_MIME_TYPES without removing this branch
 * would have left a path that still mislabels arbitrary text as an image.
 */
function detectMimeFromBuffer(buffer: Uint8Array): AllowedMime | null {
  const matchesAt = (offset: number, bytes: number[]): boolean =>
    buffer.length >= offset + bytes.length && bytes.every((b, i) => buffer[offset + i] === b);

  for (const sig of MAGIC_BYTES) {
    if (!matchesAt(sig.offset ?? 0, sig.bytes)) continue;
    if (sig.alsoRequire && !matchesAt(sig.alsoRequire.offset, sig.alsoRequire.bytes)) continue;
    return sig.mime;
  }

  return null;
}

export const POST = withAdminErrorHandler(async (request: NextRequest) => {
  // Defense in depth: verify platform admin even though middleware checks too
  const actingAdmin = await requirePlatformAdmin();

  // @types/node@22 undici-types shadows DOM FormData (missing .get())
  type WebFormData = { get(name: string): File | string | null };
  const formData = await request.formData() as unknown as WebFormData;
  const file = formData.get('file') as File | null;
  const communityId = formData.get('communityId') as string | null;

  if (!file) {
    return NextResponse.json({ error: 'file is required' }, { status: 400 });
  }

  if (!communityId) {
    return NextResponse.json({ error: 'communityId is required' }, { status: 400 });
  }

  const communityIdNum = Number(communityId);
  if (!Number.isInteger(communityIdNum) || communityIdNum <= 0) {
    return NextResponse.json({ error: 'communityId must be a positive integer' }, { status: 400 });
  }

  // Size check
  if (file.size > MAX_FILE_SIZE) {
    return NextResponse.json(
      { error: `File too large. Maximum size is ${MAX_FILE_SIZE / (1024 * 1024)} MB.` },
      { status: 400 },
    );
  }

  // Read file bytes for magic-byte validation
  const arrayBuffer = await file.arrayBuffer();
  const bytes = new Uint8Array(arrayBuffer);
  const detectedMime = detectMimeFromBuffer(bytes);

  if (!detectedMime) {
    return NextResponse.json(
      { error: 'Invalid file type. Allowed: JPEG, PNG, WebP.' },
      { status: 400 },
    );
  }

  const ext = MIME_TO_EXT[detectedMime];
  const storagePath = `${communityIdNum}/site/${randomUUID()}.${ext}`;

  // Upload to Supabase Storage via admin client (bypasses RLS)
  const admin = createAdminClient();
  const { error: uploadError } = await admin.storage
    .from(COMMUNITY_ASSETS_BUCKET)
    .upload(storagePath, bytes, {
      contentType: detectedMime,
      upsert: false,
    });

  assertNoDbError(uploadError, 'Failed to upload asset to storage');

  // Generate public URL
  const { data: urlData } = admin.storage.from(COMMUNITY_ASSETS_BUCKET).getPublicUrl(storagePath);

  // best-effort: the file is already stored and the URL already returned, so
  // failing the request here would report an error for an upload that in fact
  // succeeded. This is the ONLY action in the console where losing the record
  // is preferable to failing the operation — every other logAdminAction call
  // throws.
  await logAdminAction({
    admin: actingAdmin,
    action: 'file_uploaded',
    resourceType: 'storage_object',
    resourceId: storagePath,
    communityId: communityIdNum,
    metadata: {
      bucket: COMMUNITY_ASSETS_BUCKET,
      content_type: detectedMime,
      size_bytes: file.size,
    },
    bestEffort: true,
  });

  return NextResponse.json({
    data: {
      url: urlData.publicUrl,
      path: storagePath,
    },
  });
});
