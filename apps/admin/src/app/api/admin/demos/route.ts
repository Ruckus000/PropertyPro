/**
 * Demo instances API — list and create demos.
 *
 * GET  /api/admin/demos — returns all demo instances ordered by created_at DESC
 * POST /api/admin/demos — creates a demo community with seeded data
 */
import { randomBytes } from 'node:crypto';
import { NextResponse, type NextRequest } from 'next/server';
import { z } from 'zod';
import { requirePlatformAdmin } from '@/lib/auth/platform-admin';
import { ALLOWED_FONTS } from '@propertypro/theme';
import { isValidHexColor, type CommunityBranding } from '@propertypro/shared';
import {
  generateDemoToken,
  encryptDemoTokenSecret,
} from '@propertypro/shared/server';
import { seedCommunity } from '@propertypro/db/seed/seed-community';
import { listDemos, insertDemo } from '@/lib/db/demo-queries';

const HEX_COLOR = z.string().refine(isValidHexColor, { message: 'Must be a hex color (#RRGGBB)' });

const createDemoSchema = z.object({
  templateType: z.enum(['condo_718', 'hoa_720', 'apartment']),
  prospectName: z.string().min(1).max(100),
  branding: z.object({
    primaryColor: HEX_COLOR,
    secondaryColor: HEX_COLOR,
    accentColor: HEX_COLOR,
    fontHeading: z.string().refine((f) => (ALLOWED_FONTS as readonly string[]).includes(f), {
      message: 'Font not in allowed list',
    }),
    fontBody: z.string().refine((f) => (ALLOWED_FONTS as readonly string[]).includes(f), {
      message: 'Font not in allowed list',
    }),
    logoPath: z.string().optional(),
  }),
  externalCrmUrl: z.string().url().optional().or(z.literal('')),
  prospectNotes: z.string().max(2000).optional(),
});

export async function GET() {
  await requirePlatformAdmin();

  const { data, error } = await listDemos();

  if (error) {
    return NextResponse.json(
      { error: { code: 'INTERNAL_ERROR', message: error.message } },
      { status: 500 },
    );
  }

  return NextResponse.json({ data: data ?? [] });
}

export async function POST(request: NextRequest) {
  await requirePlatformAdmin();

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json(
      { error: { code: 'VALIDATION_ERROR', message: 'Invalid JSON body' } },
      { status: 400 },
    );
  }

  const parseResult = createDemoSchema.safeParse(body);
  if (!parseResult.success) {
    return NextResponse.json(
      {
        error: {
          code: 'VALIDATION_ERROR',
          message: 'Invalid demo payload',
          details: parseResult.error.issues,
        },
      },
      { status: 400 },
    );
  }

  const { templateType, prospectName, branding, externalCrmUrl, prospectNotes } = parseResult.data;

  // Generate unique slug
  const sanitized = prospectName
    .toLowerCase()
    .replace(/[^a-z0-9]/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 40);
  const slug = `demo-${sanitized}-${randomBytes(3).toString('hex')}`;

  // Demo user emails
  const residentEmail = `demo-resident@${slug}.propertyprofl.com`;
  const boardEmail = `demo-board@${slug}.propertyprofl.com`;

  const brandingPayload: CommunityBranding = {
    primaryColor: branding.primaryColor,
    secondaryColor: branding.secondaryColor,
    accentColor: branding.accentColor,
    fontHeading: branding.fontHeading,
    fontBody: branding.fontBody,
    logoPath: branding.logoPath,
  };

  let seedResult;
  try {
    seedResult = await seedCommunity(
      {
        name: prospectName,
        slug,
        communityType: templateType,
        branding: brandingPayload,
        isDemo: true,
        city: 'Demo City',
        state: 'FL',
        zipCode: '00000',
      },
      [
        { email: residentEmail, fullName: 'Demo Resident', role: 'owner' },
        { email: boardEmail, fullName: 'Demo Board Member', role: 'board_member' },
      ],
    );
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Failed to seed demo community';
    return NextResponse.json(
      { error: { code: 'SEED_ERROR', message } },
      { status: 500 },
    );
  }

  // Generate and encrypt HMAC secret
  const authTokenSecret = randomBytes(32).toString('hex');
  const encryptionKey = process.env.DEMO_TOKEN_ENCRYPTION_KEY_HEX;
  const storedSecret = encryptionKey
    ? encryptDemoTokenSecret(authTokenSecret, encryptionKey)
    : authTokenSecret;

  const residentUser = seedResult.users.find((u) => u.email === residentEmail);
  const boardUser = seedResult.users.find((u) => u.email === boardEmail);

  if (!residentUser || !boardUser) {
    return NextResponse.json(
      { error: { code: 'SEED_ERROR', message: 'Demo users not found in seed result' } },
      { status: 500 },
    );
  }

  const { data: demoInstance, error: insertError } = await insertDemo({
    template_type: templateType,
    prospect_name: prospectName,
    slug,
    theme: brandingPayload as Record<string, unknown>,
    seeded_community_id: seedResult.communityId,
    demo_resident_user_id: residentUser.userId,
    demo_board_user_id: boardUser.userId,
    demo_resident_email: residentEmail,
    demo_board_email: boardEmail,
    auth_token_secret: storedSecret,
    external_crm_url: externalCrmUrl || undefined,
    prospect_notes: prospectNotes || undefined,
  });

  if (insertError || !demoInstance) {
    return NextResponse.json(
      { error: { code: 'INTERNAL_ERROR', message: insertError?.message ?? 'Failed to create demo instance' } },
      { status: 500 },
    );
  }

  // Generate preview tokens (1-hour TTL)
  const residentToken = generateDemoToken({
    demoId: demoInstance.id,
    userId: residentUser.userId,
    role: 'resident',
    secret: authTokenSecret,
    ttlSeconds: 3600,
  });
  const boardToken = generateDemoToken({
    demoId: demoInstance.id,
    userId: boardUser.userId,
    role: 'board',
    secret: authTokenSecret,
    ttlSeconds: 3600,
  });

  return NextResponse.json(
    {
      data: {
        demoId: demoInstance.id,
        slug,
        previewUrl: `/demo/${demoInstance.id}/preview`,
        mobilePreviewUrl: `/demo/${demoInstance.id}/mobile`,
        residentToken,
        boardToken,
      },
    },
    { status: 201 },
  );
}
