/**
 * POST /api/admin/upload — Admin image upload for site blocks and community assets.
 *
 * Protected by requirePlatformAdmin(). Validates file size, MIME type via
 * magic bytes, and uploads to Supabase Storage.
 *
 * Storage path: community-assets/{communityId}/site/{uuid}.{ext}
 */
import { NextResponse } from 'next/server';
import { randomUUID } from 'crypto';
import { requirePlatformAdmin } from '@/lib/auth/platform-admin';
import { createAdminClient } from '@propertypro/db/supabase/admin';

const MAX_FILE_SIZE = 5 * 1024 * 1024; // 5 MB

const ALLOWED_MIME_TYPES = [
  'image/jpeg',
  'image/png',
  'image/webp',
  'image/svg+xml',
] as const;

type AllowedMime = (typeof ALLOWED_MIME_TYPES)[number];

/** Magic byte signatures for allowed image types */
const MAGIC_BYTES: Array<{ mime: AllowedMime; bytes: number[]; offset?: number }> = [
  { mime: 'image/png', bytes: [0x89, 0x50, 0x4e, 0x47] },
  { mime: 'image/jpeg', bytes: [0xff, 0xd8, 0xff] },
  { mime: 'image/webp', bytes: [0x57, 0x45, 0x42, 0x50], offset: 8 },
  // SVG is text-based; validated separately below
];

const MIME_TO_EXT: Record<AllowedMime, string> = {
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
  'image/svg+xml': 'svg',
};

const STORAGE_BUCKET = 'community-assets';

/**
 * Detect MIME type from magic bytes in a Uint8Array buffer.
 * Returns the matched MIME string or null if unrecognised.
 */
function detectMimeFromBuffer(buffer: Uint8Array): AllowedMime | null {
  for (const sig of MAGIC_BYTES) {
    const start = sig.offset ?? 0;
    if (buffer.length < start + sig.bytes.length) continue;
    const matches = sig.bytes.every((b, i) => buffer[start + i] === b);
    if (matches) return sig.mime;
  }

  // SVG detection: check for XML/SVG opening tags in the first 256 bytes
  const head = new TextDecoder('utf-8', { fatal: false }).decode(buffer.slice(0, 256));
  if (head.includes('<svg') || head.includes('<?xml')) {
    return 'image/svg+xml';
  }

  return null;
}

export async function POST(request: Request) {
  // Defense in depth: verify platform admin even though middleware checks too
  await requirePlatformAdmin();

  const formData = await request.formData();
  const file = formData.get('file');
  const communityId = formData.get('communityId');

  if (!file || !(file instanceof Blob)) {
    return NextResponse.json({ error: 'file is required' }, { status: 400 });
  }

  if (!communityId || typeof communityId !== 'string') {
    return NextResponse.json({ error: 'communityId is required' }, { status: 400 });
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
      { error: 'Invalid file type. Allowed: JPEG, PNG, WebP, SVG.' },
      { status: 400 },
    );
  }

  const ext = MIME_TO_EXT[detectedMime];
  const storagePath = `${communityId}/site/${randomUUID()}.${ext}`;

  // Upload to Supabase Storage via admin client (bypasses RLS)
  const admin = createAdminClient();
  const { error: uploadError } = await admin.storage
    .from(STORAGE_BUCKET)
    .upload(storagePath, bytes, {
      contentType: detectedMime,
      upsert: false,
    });

  if (uploadError) {
    return NextResponse.json(
      { error: `Upload failed: ${uploadError.message}` },
      { status: 500 },
    );
  }

  // Generate public URL
  const { data: urlData } = admin.storage.from(STORAGE_BUCKET).getPublicUrl(storagePath);

  return NextResponse.json({
    data: {
      url: urlData.publicUrl,
      path: storagePath,
    },
  });
}
