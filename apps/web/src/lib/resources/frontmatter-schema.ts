/**
 * Zod schema for marketing resource-article MDX frontmatter.
 *
 * Deliberately much smaller than the help schema: resources are PUBLIC, flat,
 * and ungated. There is no `category`, no `roles`, no `featureGates` and no
 * `contextPaths` — every one of those exists to decide who may see a help
 * article, and the answer here is always "anyone".
 *
 * Validation throws at load rather than coercing, so a malformed article fails
 * `next build` loudly instead of shipping a half-rendered page.
 */
import { z } from 'zod';
import {
  ISO_DATE_REGEX,
  SLUG_REGEX,
  STATUTE_REGEX,
} from '@/lib/content/frontmatter-patterns';

/**
 * Google truncates meta descriptions around 160 characters. Capping here rather
 * than silently shipping a clipped snippet is the whole reason this corpus
 * exists — see docs/gtm/03-LAUNCH-READINESS.md item B2.
 */
const MAX_DESCRIPTION_LENGTH = 160;

export const resourceFrontmatterSchema = z
  .object({
    title: z.string().min(1, 'title is required'),
    description: z
      .string()
      .min(1, 'description is required')
      .max(
        MAX_DESCRIPTION_LENGTH,
        `description must be ${MAX_DESCRIPTION_LENGTH} characters or fewer (it is the meta description)`,
      ),
    slug: z
      .string()
      .min(1, 'slug is required')
      .regex(SLUG_REGEX, 'slug must be lowercase kebab-case (e.g. "condo-website-requirements")'),
    publishedAt: z
      .string()
      .regex(ISO_DATE_REGEX, 'publishedAt must be an ISO date (YYYY-MM-DD)'),
    updatedAt: z
      .string()
      .regex(ISO_DATE_REGEX, 'updatedAt must be an ISO date (YYYY-MM-DD)'),
    statutes: z
      .array(
        z
          .string()
          .regex(
            STATUTE_REGEX,
            'statutes entries must look like "§718.111(12)(g)" or "HB 1203"',
          ),
      )
      .default([]),
    keywords: z.array(z.string()).default([]),
    tags: z.array(z.string()).default([]),
    /** Excluded from the index, `generateStaticParams`, and the sitemap. */
    draft: z.boolean().default(false),
  })
  .strict();

export type ResourceFrontmatter = z.infer<typeof resourceFrontmatterSchema>;

export interface FrontmatterValidationError {
  path: string;
  message: string;
}

export type ResourceFrontmatterResult =
  | { ok: true; value: ResourceFrontmatter }
  | { ok: false; errors: FrontmatterValidationError[] };

export function validateResourceFrontmatter(data: unknown): ResourceFrontmatterResult {
  const parsed = resourceFrontmatterSchema.safeParse(data);
  if (parsed.success) {
    return { ok: true, value: parsed.data };
  }
  return {
    ok: false,
    errors: parsed.error.issues.map((issue) => ({
      path: issue.path.join('.') || '(root)',
      message: issue.message,
    })),
  };
}
