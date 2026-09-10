import { NextResponse } from 'next/server';
import { isLoopbackUrl } from '@propertypro/shared';
import { sql } from '@propertypro/db/filters';
// AUTHZ: Dev reset-onboarding — resets community onboarding state (dev-only, 404 in production)
import { createUnscopedClient } from '@propertypro/db/unsafe';

const db = createUnscopedClient();

type WizardType = 'condo' | 'apartment';

function parseWizardType(raw: string | null): WizardType | null {
  if (raw === 'condo' || raw === 'apartment') return raw;
  return null;
}

export async function POST(request: Request) {
  if (process.env.NODE_ENV !== 'development') {
    return new NextResponse('Not Found', { status: 404 });
  }

  // `NODE_ENV` says how this process was started, NOT which project it talks
  // to. A worktree whose `.env.local` names production runs `pnpm dev` as
  // `development` and writes to prod — which is how a real `super_admin` row
  // was created in the production project on 2026-09-10. Refuse unless the
  // Supabase URL is demonstrably local.
  if (!isLoopbackUrl(process.env.NEXT_PUBLIC_SUPABASE_URL)) {
    return new NextResponse(
      'Refusing to run: NEXT_PUBLIC_SUPABASE_URL is not a local Supabase instance. ' +
        'This route mints sessions and grants; against a remote project that is a real write. ' +
        'Start a local stack (`supabase start`) or use scripts/with-env-local-demo-db.sh.',
      { status: 403 },
    );
  }

  const body = (await request.json().catch(() => ({}))) as {
    slug?: string;
    wizardType?: string;
  };

  const slug = body.slug?.trim();
  const wizardType = parseWizardType(body.wizardType ?? null);

  if (!slug || !wizardType) {
    return NextResponse.json(
      { error: 'Invalid payload: provide slug and wizardType ("condo" | "apartment")' },
      { status: 400 },
    );
  }

  const result = await db.execute<{ community_id: number }>(sql`
    WITH target AS (
      SELECT id AS community_id
      FROM communities
      WHERE slug = ${slug}
        AND deleted_at IS NULL
      LIMIT 1
    )
    INSERT INTO onboarding_wizard_state (
      community_id,
      wizard_type,
      status,
      last_completed_step,
      step_data,
      completed_at
    )
    SELECT
      target.community_id,
      ${wizardType},
      'in_progress',
      NULL,
      '{}'::jsonb,
      NULL
    FROM target
    ON CONFLICT (community_id, wizard_type) DO UPDATE
      SET status = 'in_progress',
          last_completed_step = NULL,
          step_data = '{}'::jsonb,
          completed_at = NULL,
          updated_at = now()
    RETURNING community_id
  `);

  const rows =
    Array.isArray(result) ? result : (result as { rows?: Array<{ community_id: number }> }).rows ?? [];
  const communityId = rows[0]?.community_id;

  if (!communityId) {
    return NextResponse.json(
      { error: `Community not found for slug "${slug}"` },
      { status: 404 },
    );
  }

  return NextResponse.json({
    ok: true,
    communityId,
    slug,
    wizardType,
    status: 'in_progress',
  });
}
