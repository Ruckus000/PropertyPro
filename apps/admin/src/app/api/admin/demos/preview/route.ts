import { NextResponse, type NextRequest } from 'next/server';
import { z } from 'zod';
import { requirePlatformAdmin } from '@/lib/auth/platform-admin';
import { compileDemoTemplate } from '@/lib/site-template/compile-template';
import { isDemoTemplateId } from '@propertypro/shared';

const previewSchema = z.object({
  communityType: z.enum(['condo_718', 'hoa_720', 'apartment']),
  publicTemplateId: z.string().refine(isDemoTemplateId, 'Invalid template ID'),
  mobileTemplateId: z.string().refine(isDemoTemplateId, 'Invalid template ID'),
  prospectName: z.string().min(1).max(100),
  branding: z.object({
    primaryColor: z.string().optional(),
    secondaryColor: z.string().optional(),
    accentColor: z.string().optional(),
    fontHeading: z.string().optional(),
    fontBody: z.string().optional(),
  }).optional(),
});

export async function POST(request: NextRequest) {
  await requirePlatformAdmin();

  const body = await request.json();
  const parsed = previewSchema.safeParse(body);

  if (!parsed.success) {
    return NextResponse.json(
      { error: { code: 'VALIDATION_ERROR', message: parsed.error.issues[0]?.message ?? 'Invalid input' } },
      { status: 400 },
    );
  }

  const { publicTemplateId, mobileTemplateId, prospectName, branding: rawBranding } = parsed.data;

  // compileDemoTemplate requires all branding fields to be non-optional strings when branding is
  // provided. Resolve each field to a defined string or omit branding entirely.
  const branding = rawBranding
    ? {
        primaryColor: rawBranding.primaryColor ?? '#2563EB',
        secondaryColor: rawBranding.secondaryColor ?? '#1E40AF',
        accentColor: rawBranding.accentColor ?? '#DBEAFE',
        fontHeading: rawBranding.fontHeading ?? 'Inter',
        fontBody: rawBranding.fontBody ?? 'Inter',
      }
    : undefined;

  try {
    const [publicHtml, mobileHtml] = await Promise.all([
      compileDemoTemplate({ templateId: publicTemplateId, communityName: prospectName, branding }),
      compileDemoTemplate({ templateId: mobileTemplateId, communityName: prospectName, branding }),
    ]);

    return NextResponse.json({ publicHtml, mobileHtml });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Template compilation failed';
    return NextResponse.json(
      { error: { code: 'COMPILE_ERROR', message } },
      { status: 500 },
    );
  }
}
