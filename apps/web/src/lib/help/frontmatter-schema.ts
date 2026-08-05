/**
 * Zod schema for help article MDX frontmatter.
 *
 * Two consumers:
 *   1. parseArticleFrontmatter() in lib/services/help-article-service.ts —
 *      validates at runtime; throws with descriptive errors instead of
 *      silently coercing missing/malformed fields.
 *   2. scripts/verify-help-content.ts — the `guard:help-content` CI check
 *      (ADR-004), which uses this schema to fail PRs on author errors and
 *      drift between featureGates strings and the CommunityFeatures interface.
 *
 * COMMUNITY_FEATURE_KEYS is the runtime mirror of CommunityFeatures
 * (packages/shared/src/features/types.ts). The guard verifies the two stay
 * in sync; if you add a flag to CommunityFeatures, add it here too or CI
 * will fail.
 */
import { z } from 'zod';
// Shared with the public marketing-resources corpus — see
// lib/content/frontmatter-patterns.ts for why these are single-sourced.
import {
  ISO_DATE_REGEX,
  SLUG_REGEX,
  STATUTE_REGEX,
} from '@/lib/content/frontmatter-patterns';

export const COMMUNITY_FEATURE_KEYS = [
  'hasCompliance',
  'hasStatutoryCategories',
  'hasLeaseTracking',
  'hasMeetings',
  'hasPublicNoticesPage',
  'hasTransparencyPage',
  'hasOwnerRole',
  'hasVoting',
  'requiresPublicWebsite',
  'hasMaintenanceRequests',
  'hasAnnouncements',
  'hasFinance',
  'hasViolations',
  'hasARC',
  'hasPolls',
  'hasCommunityBoard',
  'hasWorkOrders',
  'hasAmenities',
  'hasPackageLogging',
  'hasVisitorLogging',
  'hasCalendarSync',
  'hasAccountingConnectors',
  'hasEsign',
  'hasEmergencyNotifications',
  'hasSiteEditor',
  'hasSitePolishBlocks',
  'hasSiteCustomCss',
  'hasSiteCustomDomain',
  'hasSitePortfolioTemplates',
  'hasInsuranceHub',
  'hasReserveTransparency',
  'hasSnowbirdDigest',
  'hasStormTools',
] as const;

export type CommunityFeatureKey = (typeof COMMUNITY_FEATURE_KEYS)[number];

export const helpFrontmatterSchema = z
  .object({
    title: z.string().min(1, 'title is required'),
    description: z.string().min(1, 'description is required'),
    category: z.string().min(1, 'category is required'),
    slug: z
      .string()
      .min(1, 'slug is required')
      .regex(SLUG_REGEX, 'slug must be lowercase kebab-case (e.g. "welcome-to-propertypro")'),
    roles: z.array(z.string()).default([]),
    keywords: z.array(z.string()).default([]),
    tags: z.array(z.string()).default([]),
    relatedArticles: z.array(z.string()).default([]),
    featured: z.boolean().default(false),
    updatedAt: z
      .string()
      .regex(ISO_DATE_REGEX, 'updatedAt must be ISO date (YYYY-MM-DD)'),
    contextPaths: z.array(z.string()).optional(),
    statutes: z
      .array(
        z
          .string()
          .regex(
            STATUTE_REGEX,
            'statute must be a §XXX.XXX statute reference or HB/SB bill reference (e.g. "§718.111(12)(g)", "HB 1203")',
          ),
      )
      .optional(),
    featureGates: z
      .array(
        z.enum(COMMUNITY_FEATURE_KEYS, {
          message: `featureGates entry must be a key of CommunityFeatures (one of: ${COMMUNITY_FEATURE_KEYS.join(', ')})`,
        }),
      )
      .optional(),
    lastReviewedAt: z
      .string()
      .regex(ISO_DATE_REGEX, 'lastReviewedAt must be ISO date (YYYY-MM-DD)')
      .optional(),
    heroMedia: z
      .object({
        src: z
          .string()
          .min(1)
          .regex(/^\/help\//, 'heroMedia.src must be a repo asset path starting with /help/'),
        alt: z.string().min(1, 'heroMedia.alt is required'),
        caption: z.string().optional(),
        width: z.number().int().positive(),
        height: z.number().int().positive(),
        /** Required in practice for .mp4/.webm heroes; enforced by guard. */
        poster: z
          .string()
          .regex(/^\/help\//, 'heroMedia.poster must start with /help/')
          .optional(),
      })
      .optional(),
    upNext: z
      .string()
      .regex(SLUG_REGEX, 'upNext must be an article slug (lowercase kebab-case)')
      .optional(),
  })
  .passthrough();

export type HelpFrontmatter = z.infer<typeof helpFrontmatterSchema>;

export interface FrontmatterValidationError {
  path: string;
  message: string;
}

export function validateFrontmatter(
  data: unknown,
): { ok: true; value: HelpFrontmatter } | { ok: false; errors: FrontmatterValidationError[] } {
  const result = helpFrontmatterSchema.safeParse(data);
  if (result.success) {
    return { ok: true, value: result.data };
  }
  const errors: FrontmatterValidationError[] = result.error.issues.map((issue) => ({
    path: issue.path.join('.') || '(root)',
    message: issue.message,
  }));
  return { ok: false, errors };
}
