import { NextResponse, type NextRequest } from 'next/server';
import { z } from 'zod';
import { requirePlatformAdmin } from '@/lib/auth/platform-admin';
import { compileTemplatePreview } from '@/lib/templates/public-site-template-service';

const previewSchema = z.object({
  jsxSource: z.string().min(1).max(100_000),
  communityName: z.string().min(1).max(100).optional(),
}).strict();

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

  const parsed = previewSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: { code: 'VALIDATION_ERROR', message: parsed.error.issues[0]?.message ?? 'Invalid input' } },
      { status: 400 },
    );
  }

  const result = await compileTemplatePreview({
    jsxSource: parsed.data.jsxSource,
    templateContext: { communityName: parsed.data.communityName ?? 'Community Name' },
  });

  return NextResponse.json(result);
}
