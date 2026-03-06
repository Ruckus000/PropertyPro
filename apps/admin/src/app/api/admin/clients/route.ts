/**
 * POST /api/admin/clients — Create a new client community.
 *
 * Creates the community record, optionally sets branding, and can
 * invite an initial admin user.
 */
import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { authorizePlatformAdminRequest } from '@/lib/auth/authorize-platform-admin-request';
import { provisionInitialAdmin } from '@/lib/auth/provision-initial-admin';
import { createTypedAdminClient } from '@/lib/db/admin-client-types';

const HEX_COLOR = z.string().regex(/^#[0-9A-Fa-f]{6}$/, { message: 'Invalid hex color' });

const createClientSchema = z.object({
  name: z.string().min(1).max(200),
  slug: z
    .string()
    .min(2)
    .max(63)
    .regex(/^[a-z0-9]([a-z0-9-]*[a-z0-9])?$/, {
      message: 'Slug must be lowercase alphanumeric with hyphens, no leading/trailing hyphens',
    }),
  communityType: z.enum(['condo_718', 'hoa_720', 'apartment']),
  address: z.string().max(500).optional(),
  city: z.string().max(100).optional(),
  state: z.string().max(2).default('FL'),
  zipCode: z.string().max(10).optional(),
  unitCount: z.number().int().positive().optional(),
  subscriptionPlan: z.string().min(1).optional(),
  branding: z
    .object({
      primaryColor: HEX_COLOR.optional(),
      secondaryColor: HEX_COLOR.optional(),
      accentColor: HEX_COLOR.optional(),
      fontHeading: z.string().optional(),
      fontBody: z.string().optional(),
      logoPath: z.string().optional(),
    })
    .optional(),
  initialAdmin: z
    .object({
      email: z.string().email(),
      role: z.enum(['board_president', 'board_member', 'cam', 'site_manager']),
    })
    .optional(),
});

async function rollbackCreatedCommunity(
  db: ReturnType<typeof createTypedAdminClient>,
  communityId: number,
): Promise<void> {
  const { error } = await db
    .from('communities')
    .delete()
    .eq('id', communityId);

  if (error) {
    console.error('[Admin] Failed to roll back community creation:', error);
  }
}

export async function POST(request: NextRequest) {
  let db: ReturnType<typeof createTypedAdminClient> | null = null;
  let createdCommunityId: number | null = null;

  const authError = await authorizePlatformAdminRequest();
  if (authError) {
    return authError;
  }

  try {
    let body: unknown;
    try {
      body = await request.json();
    } catch {
      return NextResponse.json(
        { error: { message: 'Invalid JSON body' } },
        { status: 400 },
      );
    }

    const parsed = createClientSchema.safeParse(body);

    if (!parsed.success) {
      return NextResponse.json(
        { error: { message: 'Validation failed', details: parsed.error.flatten() } },
        { status: 400 },
      );
    }

    const data = parsed.data;
    db = createTypedAdminClient();

    // Check slug uniqueness
    const { data: existing } = await db
      .from('communities')
      .select('id')
      .eq('slug', data.slug)
      .maybeSingle();

    if (existing) {
      return NextResponse.json(
        { error: { message: `Slug "${data.slug}" is already in use` } },
        { status: 409 },
      );
    }

    // Create the community
    const { data: community, error: communityError } = await db
      .from('communities')
      .insert({
        name: data.name,
        slug: data.slug,
        community_type: data.communityType,
        address_line1: data.address || null,
        city: data.city || null,
        state: data.state,
        zip_code: data.zipCode || null,
        subscription_plan: data.subscriptionPlan || null,
        subscription_status: data.subscriptionPlan ? 'active' : null,
        is_demo: false,
        branding: data.branding || null,
      })
      .select('id, name, slug, community_type, subscription_status, created_at')
      .single();

    if (communityError) {
      console.error('[Admin] Failed to create community:', communityError);
      return NextResponse.json(
        { error: { message: 'Failed to create community' } },
        { status: 500 },
      );
    }

    createdCommunityId = community.id;

    // Create initial compliance items for the community
    const complianceCategories = getComplianceCategories(data.communityType);
    if (complianceCategories.length > 0) {
      const { error: complianceError } = await db.from('compliance_items').insert(
        complianceCategories.map((category) => ({
          community_id: community.id,
          category,
          status: 'not_met',
          description: `${category} compliance requirement`,
        })),
      );

      if (complianceError) {
        console.error('[Admin] Failed to create compliance items:', complianceError);
        await rollbackCreatedCommunity(db, community.id);
        return NextResponse.json(
          { error: { message: 'Failed to create compliance items for community' } },
          { status: 500 },
        );
      }
    }

    // Invite initial admin if provided
    let invitationSent = false;
    if (data.initialAdmin) {
      const initialAdminResult = await provisionInitialAdmin(db, {
        communityId: community.id,
        email: data.initialAdmin.email,
        role: data.initialAdmin.role,
      });

      if (!initialAdminResult.success) {
        await rollbackCreatedCommunity(db, community.id);
        return NextResponse.json(
          { error: { message: 'Failed to provision initial admin' } },
          { status: 500 },
        );
      }

      invitationSent = initialAdminResult.invitationSent;
    }

    return NextResponse.json(
      {
        data: {
          community,
          invitationSent,
        },
      },
      { status: 201 },
    );
  } catch (err) {
    console.error('[Admin] Create client error:', err);

    if (db && createdCommunityId !== null) {
      await rollbackCreatedCommunity(db, createdCommunityId);
    }

    return NextResponse.json(
      { error: { message: 'Internal server error' } },
      { status: 500 },
    );
  }
}

/**
 * Returns baseline compliance categories for a community type.
 */
function getComplianceCategories(type: 'condo_718' | 'hoa_720' | 'apartment'): string[] {
  switch (type) {
    case 'condo_718':
      return [
        'governing_documents',
        'budget_financial_reports',
        'meeting_minutes',
        'contracts',
        'insurance_policies',
      ];
    case 'hoa_720':
      return [
        'governing_documents',
        'budget_financial_reports',
        'meeting_minutes',
        'contracts',
      ];
    case 'apartment':
      return [];
    default:
      return [];
  }
}

/**
 * GET /api/admin/clients?slug=xxx — Check slug availability.
 */
export async function GET(request: NextRequest) {
  const authError = await authorizePlatformAdminRequest();
  if (authError) {
    return authError;
  }

  const db = createTypedAdminClient();
  const slug = request.nextUrl.searchParams.get('slug');

  if (!slug) {
    return NextResponse.json(
      { error: { message: 'slug parameter required' } },
      { status: 400 },
    );
  }

  const { data: existing } = await db
    .from('communities')
    .select('id')
    .eq('slug', slug)
    .maybeSingle();

  return NextResponse.json({
    data: { available: !existing, slug },
  });
}
