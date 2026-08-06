import { NextResponse, type NextRequest } from 'next/server';
import { captureException } from '@sentry/nextjs';
import { z } from 'zod';
import { requirePlatformAdmin } from '@/lib/auth/platform-admin';
import { compileDemoTemplate } from '@/lib/site-template/compile-template';
import { isDemoTemplateId } from '@propertypro/shared';
import { withAdminErrorHandler } from '@/lib/api/with-error-handler';
import { parseAdminBody } from '@/lib/api/parse-body';
import { brandingSchema } from '@/lib/validation/branding';

/**
 * `branding` previously accepted bare `z.string().optional()` for all five
 * fields, while the sibling create route (demos/route.ts) enforced
 * HEX_COLOR + ALLOWED_FONTS on the same values. Those strings are interpolated
 * into JavaScript source that compile-template.ts evaluates with
 * `new Function()`, so the two routes had materially different exposure to the
 * same evaluator. They now share one schema.
 */
const previewSchema = z.object({
  communityType: z.enum(['condo_718', 'hoa_720', 'apartment']),
  publicTemplateId: z.string().refine(isDemoTemplateId, 'Invalid template ID'),
  mobileTemplateId: z.string().refine(isDemoTemplateId, 'Invalid template ID'),
  prospectName: z.string().min(1).max(100),
  branding: brandingSchema.optional(),
});

export const POST = withAdminErrorHandler(async (request: NextRequest) => {
  await requirePlatformAdmin();

  const parsed = await parseAdminBody(request, previewSchema);
  if (parsed instanceof NextResponse) return parsed;

  const { publicTemplateId, mobileTemplateId, prospectName, branding: rawBranding } = parsed;

  // compileDemoTemplate requires all branding fields to be non-optional strings when branding is
  // provided. Resolve each field to a defined string or omit branding entirely.
  const branding = rawBranding
    ? {
        primaryColor: rawBranding.primaryColor ?? '#C2533A',
        secondaryColor: rawBranding.secondaryColor ?? '#6B7280',
        accentColor: rawBranding.accentColor ?? '#F7DCD2',
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
    // The compiler evaluates template source, so its errors quote file paths
    // and internal stack frames. Code kept, message generic.
    captureException(err, { extra: { context: '[demos/preview] template compilation failed' } });
    return NextResponse.json(
      { error: { code: 'COMPILE_ERROR', message: 'Template compilation failed.' } },
      { status: 500 },
    );
  }
});
