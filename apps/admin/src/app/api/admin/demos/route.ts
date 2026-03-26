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
import { isValidHexColor, type CommunityBranding, isDemoTemplateId, getStrategyById, getTemplateById } from '@propertypro/shared';
import {
  generateDemoToken,
  encryptDemoTokenSecret,
} from '@propertypro/shared/server';
import { seedCommunity } from '@propertypro/db/seed/seed-community';
import { createAdminClient } from '@propertypro/db/supabase/admin';
import { listDemos, insertDemo } from '@/lib/db/demo-queries';
import { compileDemoTemplate } from '@/lib/site-template/compile-template';

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
  publicTemplateId: z.string().refine(isDemoTemplateId, 'Invalid public template ID').optional(),
  mobileTemplateId: z.string().refine(isDemoTemplateId, 'Invalid mobile template ID').optional(),
  contentStrategy: z.string().refine(
    (id) => getStrategyById(id) !== undefined,
    'Invalid content strategy',
  ).optional(),
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

  const { templateType, prospectName, branding, externalCrmUrl, prospectNotes, publicTemplateId, mobileTemplateId, contentStrategy } = parseResult.data;

  // Validate that template IDs match the selected community type (when provided)
  if (publicTemplateId !== undefined) {
    const publicTemplate = getTemplateById(publicTemplateId);
    if (!publicTemplate || publicTemplate.communityType !== templateType) {
      return NextResponse.json(
        { error: { code: 'VALIDATION_ERROR', message: 'Public template ID does not match the selected community type' } },
        { status: 400 },
      );
    }
  }
  if (mobileTemplateId !== undefined) {
    const mobileTemplate = getTemplateById(mobileTemplateId);
    if (!mobileTemplate || mobileTemplate.communityType !== templateType) {
      return NextResponse.json(
        { error: { code: 'VALIDATION_ERROR', message: 'Mobile template ID does not match the selected community type' } },
        { status: 400 },
      );
    }
  }

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

  const strategy = contentStrategy !== undefined ? getStrategyById(contentStrategy) : undefined;

  let seedResult;
  try {
    const seedConfig: Parameters<typeof seedCommunity>[0] = {
      name: prospectName,
      slug,
      communityType: templateType,
      branding: brandingPayload,
      isDemo: true,
      city: 'Demo City',
      state: 'FL',
      zipCode: '00000',
    };
    if (strategy?.seedHints) {
      seedConfig.seedHints = strategy.seedHints;
    }
    seedResult = await seedCommunity(
      seedConfig,
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

  // Set trial_ends_at (14 days) and demo_expires_at (21 days) on the seeded community.
  // 14-day trial + 7-day grace period model (replaces 30-day flat expiry).
  // Note: uses untyped from() helper pattern (same as demo-queries.ts).
  if (seedResult.communityId) {
    const trialEndsAt = new Date(Date.now() + 14 * 24 * 60 * 60 * 1000).toISOString();
    const expiresAt = new Date(Date.now() + 21 * 24 * 60 * 60 * 1000).toISOString();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { error: updateError } = await (createAdminClient() as any)
      .from('communities')
      .update({ trial_ends_at: trialEndsAt, demo_expires_at: expiresAt })
      .eq('id', seedResult.communityId);
    if (updateError) {
      console.error('[demos/POST] Failed to set demo timestamps:', updateError.message);
    }
  }

  // Generate and encrypt HMAC secret — encryption key is mandatory (DB CHECK constraint
  // requires the 'enc:v1:' prefix produced by encryptDemoTokenSecret).
  const authTokenSecret = randomBytes(32).toString('hex');
  const encryptionKey = process.env.DEMO_TOKEN_ENCRYPTION_KEY_HEX;
  if (!encryptionKey) {
    console.error(
      '[demos/POST] DEMO_TOKEN_ENCRYPTION_KEY_HEX is not configured. '
      + 'Generate one with: openssl rand -hex 32',
    );
    return NextResponse.json(
      {
        error: {
          code: 'CONFIGURATION_ERROR',
          message: 'Demo token encryption key is not configured. Contact the platform administrator.',
        },
      },
      { status: 500 },
    );
  }
  const storedSecret = encryptDemoTokenSecret(authTokenSecret, encryptionKey);

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
    theme: { ...brandingPayload, ...(contentStrategy !== undefined ? { contentStrategy } : {}) } as Record<string, unknown>,
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

  // Compile and store site_blocks when template IDs are provided
  if (publicTemplateId !== undefined || mobileTemplateId !== undefined) {
    const communityId = seedResult.communityId;
    const now = new Date().toISOString();
    const adminDb = createAdminClient();

    const templateCompilations: Promise<void>[] = [];

    if (publicTemplateId !== undefined) {
      const publicTemplate = getTemplateById(publicTemplateId)!;
      templateCompilations.push(
        compileDemoTemplate({ templateId: publicTemplateId, communityName: prospectName, branding }).then(
          async (publicHtml) => {
            await adminDb.from('site_blocks').upsert({
              community_id: communityId,
              block_type: 'jsx_template',
              block_order: 0,
              content: {
                jsxSource: publicTemplate.build({ communityName: prospectName, branding }),
                compiledHtml: publicHtml,
                compiledAt: now,
              },
              is_draft: false,
              published_at: now,
              template_variant: 'public',
            } as never, { onConflict: 'community_id,block_type,is_draft,template_variant' });
          },
        ),
      );
    }

    if (mobileTemplateId !== undefined) {
      const mobileTemplate = getTemplateById(mobileTemplateId)!;
      templateCompilations.push(
        compileDemoTemplate({ templateId: mobileTemplateId, communityName: prospectName, branding }).then(
          async (mobileHtml) => {
            await adminDb.from('site_blocks').upsert({
              community_id: communityId,
              block_type: 'jsx_template',
              block_order: 0,
              content: {
                jsxSource: mobileTemplate.build({ communityName: prospectName, branding }),
                compiledHtml: mobileHtml,
                compiledAt: now,
              },
              is_draft: false,
              published_at: now,
              template_variant: 'mobile',
            } as never, { onConflict: 'community_id,block_type,is_draft,template_variant' });
          },
        ),
      );
    }

    try {
      await Promise.all(templateCompilations);
    } catch (err) {
      console.error('[demos/POST] Failed to compile/store site_blocks:', err instanceof Error ? err.message : err);
      // Non-fatal: demo was created, templates can be regenerated later
    }
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
