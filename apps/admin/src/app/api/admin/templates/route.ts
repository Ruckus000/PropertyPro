import { NextResponse, type NextRequest } from 'next/server';
import { z } from 'zod';
import { requirePlatformAdmin } from '@/lib/auth/platform-admin';
import {
  listPublicSiteTemplates,
  createPublicSiteTemplate,
} from '@/lib/templates/public-site-template-service';

const createSchema = z.object({
  communityType: z.enum(['condo_718', 'hoa_720', 'apartment']),
}).strict();

export async function GET(_request: NextRequest) {
  await requirePlatformAdmin();

  try {
    const templates = await listPublicSiteTemplates();
    return NextResponse.json({ data: templates, total: templates.length });
  } catch (error) {
    return NextResponse.json(
      { error: { code: 'INTERNAL_ERROR', message: error instanceof Error ? error.message : 'Failed to load templates' } },
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

  const parsed = createSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: { code: 'VALIDATION_ERROR', message: parsed.error.issues[0]?.message ?? 'Invalid input' } },
      { status: 400 },
    );
  }

  try {
    const template = await createPublicSiteTemplate(parsed.data.communityType);
    return NextResponse.json({ data: template }, { status: 201 });
  } catch (error) {
    return NextResponse.json(
      { error: { code: 'INTERNAL_ERROR', message: error instanceof Error ? error.message : 'Failed to create template' } },
      { status: 500 },
    );
  }
}
