/**
 * Compliance checklist API for the admin platform.
 *
 * GET /api/admin/communities/:id/compliance — list all compliance checklist items
 *
 * Status is computed at query time (not stored as a column):
 *   - has document_id + (no deadline OR before deadline)  → "met"
 *   - no document_id + past deadline                      → "overdue"
 *   - no document_id + (no deadline OR before deadline)   → "pending"
 *   - is_applicable = false                               → "not_applicable"
 */
import { NextResponse, type NextRequest } from 'next/server';
import { requirePlatformAdmin } from '@/lib/auth/platform-admin';
import { createAdminClient } from '@propertypro/db/supabase/admin';

interface RouteContext {
  params: Promise<{ id: string }>;
}

interface ChecklistRow {
  id: number;
  template_key: string;
  title: string;
  description: string | null;
  category: string;
  statute_reference: string | null;
  document_id: number | null;
  document_posted_at: string | null;
  deadline: string | null;
  is_conditional: boolean;
  is_applicable: boolean;
  created_at: string;
  updated_at: string;
}

function computeStatus(item: ChecklistRow): 'met' | 'overdue' | 'pending' | 'not_applicable' {
  if (!item.is_applicable) return 'not_applicable';
  if (item.document_id !== null) return 'met';
  if (item.deadline && new Date(item.deadline) < new Date()) return 'overdue';
  return 'pending';
}

export async function GET(_request: NextRequest, context: RouteContext) {
  await requirePlatformAdmin();

  const { id } = await context.params;
  const communityId = Number(id);
  if (!Number.isInteger(communityId) || communityId <= 0) {
    return NextResponse.json(
      { error: { code: 'INVALID_ID', message: 'Invalid community ID' } },
      { status: 400 },
    );
  }

  const db = createAdminClient();

  // Verify community exists, is not a demo, and is not an apartment (apartments have no compliance items)
  const { data: community } = await db
    .from('communities')
    .select('id, community_type, is_demo')
    .eq('id', communityId)
    .is('deleted_at', null)
    .single();

  if (!community || (community as Record<string, unknown>).is_demo) {
    return NextResponse.json(
      { error: { code: 'NOT_FOUND', message: 'Community not found' } },
      { status: 404 },
    );
  }

  const communityType = (community as Record<string, unknown>).community_type as string;
  if (communityType === 'apartment') {
    return NextResponse.json({ items: [], summary: { total: 0, met: 0, overdue: 0, pending: 0, notApplicable: 0 } });
  }

  const { data, error } = await db
    .from('compliance_checklist_items')
    .select('id, template_key, title, description, category, statute_reference, document_id, document_posted_at, deadline, is_conditional, is_applicable, created_at, updated_at')
    .eq('community_id', communityId)
    .is('deleted_at', null)
    .order('category')
    .order('title');

  if (error) {
    return NextResponse.json(
      { error: { code: 'INTERNAL_ERROR', message: error.message } },
      { status: 500 },
    );
  }

  const rows = (data ?? []) as unknown as ChecklistRow[];
  const items = rows.map((row) => ({
    ...row,
    status: computeStatus(row),
  }));

  const summary = {
    total: items.length,
    met: items.filter((i) => i.status === 'met').length,
    overdue: items.filter((i) => i.status === 'overdue').length,
    pending: items.filter((i) => i.status === 'pending').length,
    notApplicable: items.filter((i) => i.status === 'not_applicable').length,
  };

  return NextResponse.json({ items, summary });
}
