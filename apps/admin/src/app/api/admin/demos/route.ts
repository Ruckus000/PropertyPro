/**
 * Demo instances API — list and create demos.
 *
 * GET  /api/admin/demos — returns all demo instances ordered by created_at DESC
 * POST /api/admin/demos — creates a demo community with seeded data
 */
import { randomBytes } from 'node:crypto';
import { NextResponse, type NextRequest } from 'next/server';
import { z } from 'zod';
import { captureException, captureMessage } from '@sentry/nextjs';
import { requirePlatformAdmin } from '@/lib/auth/platform-admin';
import { ALLOWED_FONTS } from '@propertypro/theme';
import { BOARD_DESIGNATIONS, isValidHexColor, type CommunityBranding, isDemoTemplateId, getStrategyById, getTemplateById } from '@propertypro/shared';
import {
  generateDemoToken,
  encryptDemoTokenSecret,
} from '@propertypro/shared/server';
import { seedCommunity } from '@propertypro/db/seed/seed-community';
import { createAdminClient } from '@propertypro/db/supabase/admin';
import { insertDemo, sanitizeDemoRow } from '@/lib/db/demo-queries';
import { getDemoListData } from '@/lib/server/demos';
import { compileDemoTemplate } from '@/lib/site-template/compile-template';

const HEX_COLOR = z.string().refine(isValidHexColor, { message: 'Must be a hex color (#RRGGBB)' });
const DAY_MS = 24 * 60 * 60 * 1000;
const DEMO_TRIAL_DURATION_MS = 14 * DAY_MS;
const DEMO_GRACE_DURATION_MS = 7 * DAY_MS;

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

  try {
    const data = await getDemoListData();
    return NextResponse.json({ data: data.map(sanitizeDemoRow) });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to load demos';
    return NextResponse.json(
      { error: { code: 'INTERNAL_ERROR', message } },
      { status: 500 },
    );
  }
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

  // Synthetic email addresses used only as Supabase Auth identifiers.
  // No wildcard MX exists for *.getpropertypro.com — these addresses
  // cannot receive mail, which is intentional. No flow sends to them.
  const residentEmail = `demo-resident@${slug}.getpropertypro.com`;
  const boardEmail = `demo-board@${slug}.getpropertypro.com`;

  const brandingPayload: CommunityBranding = {
    primaryColor: branding.primaryColor,
    secondaryColor: branding.secondaryColor,
    accentColor: branding.accentColor,
    fontHeading: branding.fontHeading,
    fontBody: branding.fontBody,
    logoPath: branding.logoPath,
  };

  const strategy = contentStrategy !== undefined ? getStrategyById(contentStrategy) : undefined;
  const now = Date.now();
  const trialEndsAt = new Date(now + DEMO_TRIAL_DURATION_MS);
  const demoExpiresAt = new Date(now + DEMO_TRIAL_DURATION_MS + DEMO_GRACE_DURATION_MS);

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
      trialEndsAt,
      demoExpiresAt,
    };
    if (strategy?.seedHints) {
      seedConfig.seedHints = strategy.seedHints;
    }
    seedResult = await seedCommunity(
      seedConfig,
      [
        { email: residentEmail, fullName: 'Demo Resident', role: 'owner' },
        { email: boardEmail, fullName: 'Demo Board Member', role: 'property_manager', designation: BOARD_DESIGNATIONS[1] },
      ],
    );
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Failed to seed demo community';
    return NextResponse.json(
      { error: { code: 'SEED_ERROR', message } },
      { status: 500 },
    );
  }

  // Generate and encrypt HMAC secret — encryption key is mandatory (DB CHECK constraint
  // requires the 'enc:v1:' prefix produced by encryptDemoTokenSecret).
  const authTokenSecret = randomBytes(32).toString('hex');
  const encryptionKey = process.env.DEMO_TOKEN_ENCRYPTION_KEY_HEX;
  if (!encryptionKey) {
    captureMessage('[demos/POST] DEMO_TOKEN_ENCRYPTION_KEY_HEX is not configured. Generate one with: openssl rand -hex 32', { level: 'error' });
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

  // Emit demo_created conversion event (awaited best-effort)
  try {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await (createAdminClient() as any).from('conversion_events').insert({
      demo_id: demoInstance.id,
      community_id: seedResult.communityId,
      event_type: 'demo_created',
      source: 'admin_app',
      dedupe_key: `demo:${demoInstance.id}:created`,
      occurred_at: new Date().toISOString(),
      metadata: {},
    });
  } catch (err) {
    captureException(err, { level: 'warning', extra: { context: '[demos/POST] Failed to emit demo_created event' } });
  }

  // PR #9e — JSX template site_blocks rows are no longer rendered by the
  // public site (PR #9d retired the render path) and the block_type +
  // template_variant columns that powered them are dropped in migration
  // 0008. The demo creation flow accepted publicTemplateId /
  // mobileTemplateId for backward-compatible callers but the rows it
  // produced are unreadable from any current surface; the insertion is
  // removed here. The accepted parameters remain (silently ignored) so
  // existing API consumers don't break — they'll be cleaned up in a
  // later admin-side slice.

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
