import { NextResponse, type NextRequest } from 'next/server';
import { z } from 'zod';
import { requirePlatformAdmin } from '@/lib/auth/platform-admin';
import {
  filterPublicSiteTemplates,
  listPublicSiteTemplates,
  createPublicSiteTemplate,
} from '@/lib/templates/public-site-template-service';

const createSchema = z.object({
  communityType: z.enum(['condo_718', 'hoa_720', 'apartment']),
}).strict();

const listQuerySchema = z.object({
  q: z.string().optional(),
  communityType: z.enum(['all', 'condo_718', 'hoa_720', 'apartment']).optional(),
  lifecycle: z.enum(['all', 'live', 'needs_publish']).optional(),
}).strict();

export async function GET(request: NextRequest) {
  await requirePlatformAdmin();

  try {
    const parsedQuery = listQuerySchema.safeParse({
      q: request.nextUrl.searchParams.get('q') ?? undefined,
      communityType: request.nextUrl.searchParams.get('communityType') ?? undefined,
      lifecycle: request.nextUrl.searchParams.get('lifecycle') ?? undefined,
    });

    if (!parsedQuery.success) {
      return NextResponse.json(
        { error: { code: 'VALIDATION_ERROR', message: parsedQuery.error.issues[0]?.message ?? 'Invalid query params' } },
        { status: 400 },
      );
    }

    const templates = await listPublicSiteTemplates();
    const filtered = filterPublicSiteTemplates(templates, {
      q: parsedQuery.data.q,
      communityType: parsedQuery.data.communityType ?? 'all',
      lifecycle: parsedQuery.data.lifecycle ?? 'all',
    });

    return NextResponse.json({ data: filtered, total: templates.length });
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
