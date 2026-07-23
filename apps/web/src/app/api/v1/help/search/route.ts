/**
 * GET /api/v1/help/search?q=...&communityId=N
 *
 * Searches platform articles (filesystem) and community FAQs (DB) in parallel.
 * Returns two separate arrays — no cross-source ranking.
 *
 * Plan A1 drain #28 (Move 2 bundle): input validation (query) and output
 * envelope wrapping delegated to `runRoute()` from `@propertypro/api-contract`.
 * Auth chain, feature-gate fail-open behavior (ADR-004), and Sentry
 * telemetry preserved verbatim. Wire shape `{ data: { articles, faqs } }`
 * byte-identical to pre-migration.
 *
 * Behavior change: pre-migration 400s threw `ValidationError('Invalid search
 * parameters')`; runner produces the canonical `VALIDATION_ERROR` envelope
 * (status code 400 unchanged; message text shifts to runner default).
 */
import { runRoute } from '@propertypro/api-contract';
import { captureMessage } from '@sentry/nextjs';
import { getFeaturesForCommunity } from '@propertypro/shared';
import { withErrorHandler } from '@/lib/api/error-handler';
import { requireAuthenticatedUserId } from '@/lib/api/auth';
import { requireCommunityMembership } from '@/lib/api/community-membership';
import { resolveEffectiveCommunityId } from '@/lib/api/tenant-context';
import { requireEntitledForAdminRead } from '@/lib/middleware/read-entitlement-guard';
import {
  getAllArticles,
  safelyFilterArticlesByFeatures,
  searchArticles,
} from '@/lib/services/help-article-service';
import { searchCommunityFaqs } from '@/lib/services/faq-service';
import { helpSearchGetContract } from './contract';

/**
 * Length cap on the `query` field sent to Sentry on a zero-result event.
 * The route's Zod schema allows up to 200 chars; users sometimes type
 * identifying strings into search boxes (names, addresses), so we truncate
 * before send to bound any incidental PII. Sentry's beforeSend hook strips
 * auth/cookie headers; this is the runtime defense for body content (parity
 * with the comment-truncation rationale on /api/v1/help/feedback).
 */
const SEARCH_QUERY_CAPTURE_MAX_LEN = 100;

export const GET = withErrorHandler(
  runRoute(helpSearchGetContract, async ({ query, req }) => {
    const { q } = query;
    const communityId = resolveEffectiveCommunityId(req, query.communityId);
    const userId = await requireAuthenticatedUserId();
    const membership = await requireCommunityMembership(communityId, userId);
    // Lapsed communities lose admin reads (residents unaffected — guard short-circuits).
    await requireEntitledForAdminRead(communityId, membership);

    // Search both sources in parallel.
    // Filter articles by community feature gates so apartment-only articles
    // don't surface in condo/HOA search results (and vice versa). Fail open
    // (return everything) when feature evaluation throws — see ADR-004.
    let features;
    try {
      features = getFeaturesForCommunity(membership.communityType);
    } catch (error) {
      captureMessage('help_feature_gate_failure', {
        level: 'warning',
        extra: {
          source: 'help_search_api',
          communityId,
          communityType: membership.communityType,
          error: error instanceof Error ? error.message : String(error),
        },
      });
      features = null;
    }
    const allArticles = safelyFilterArticlesByFeatures(getAllArticles(), features, {
      onError: (error) => {
        captureMessage('help_feature_gate_failure', {
          level: 'warning',
          extra: {
            source: 'help_search_api_filter',
            communityId,
            error: error instanceof Error ? error.message : String(error),
          },
        });
      },
    });
    const articleResults = searchArticles(allArticles, q);

    const { hits: faqResults, totalRowCount: faqCount } = await searchCommunityFaqs(
      communityId,
      q,
      10,
    );

    // Telemetry: zero-result searches (queries ≥ 3 chars to avoid 2-char noise).
    // Fires only when BOTH article and FAQ results are empty — a query that
    // matches an FAQ still gives the user something useful and is not a
    // content gap. Surfaced via Sentry messages; the weekly content-gaps
    // script aggregates these into an authors-readable report.
    // See ADR-004 / 2026-05-07 audit.
    if (q.length >= 3 && articleResults.length === 0 && faqResults.length === 0) {
      captureMessage('help_search_no_results', {
        level: 'info',
        extra: {
          query: q.slice(0, SEARCH_QUERY_CAPTURE_MAX_LEN),
          communityId,
          articleCount: allArticles.length,
          faqCount,
        },
      });
    }

    return {
      articles: articleResults.map((a) => ({
        title: a.title,
        description: a.description,
        category: a.category,
        slug: a.slug,
        roles: a.roles,
        readTimeMinutes: a.readTimeMinutes,
      })),
      faqs: faqResults,
    };
  }),
);
