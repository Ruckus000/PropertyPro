import { captureMessage } from '@sentry/nextjs';
import { blockSchemaRegistry, TOMBSTONE_BLOCK_TYPE } from '@propertypro/shared';

/**
 * Report public-site blocks that will not render, once per request.
 *
 * ## Why this exists
 *
 * Every renderer under `components/public-site/blocks/` handles a failed
 * `safeParse` the same way: `console.warn` and `return null`. The section
 * vanishes and the page still returns HTTP 200. Two of those renderers are
 * `documents` and `meetings` — the §718.111(12)(g) statutory-transparency
 * sections a condo association is legally required to publish.
 *
 * Nothing alerted on that. `deploy.yml`'s only verification is a curl of
 * `/auth/login` for 200, and a blanked section is indistinguishable from a
 * community that simply has no such section. A schema regression could blank
 * every community's public site for weeks. This helper logs the event so
 * regressions surface in Sentry within one request instead of going silent
 * for weeks.
 *
 * `registry.ts` also *claimed* this already existed — "Unknown block types …
 * are skipped at render time with a Sentry warning (block-type-missing-
 * renderer)" — and no such call was ever written. That claim is now true.
 *
 * ## Why it lives here and not in the renderers
 *
 * The obvious placement is one `captureMessage` per renderer. That is the
 * wrong call for two reasons.
 *
 * First, bundle size. Seven of the eleven renderers are also imported by the
 * editor's client canvas through `view-registry.ts`, so importing
 * `@sentry/nextjs` into them drags the SDK onto the site-editor route, which
 * runs against a 700 KiB hard budget that fails the build. The public-site
 * page is server-only, so a call sited here costs the client nothing.
 *
 * Second, volume. Eleven call sites means one event per broken block per
 * request. A community with a bad hero and three bad sections would emit four
 * events on every page view, from every visitor. Sited here it is one event
 * carrying all of them — and, because the route is uncached, additionally
 * throttled per community per degraded state (see REPORT_TTL_MS). Collapsing
 * the per-block multiplier without the per-request one would still let a
 * single crawled community burn the Sentry quota.
 *
 * Cardinality: the event name is a fixed string. Everything variable —
 * community, block ids, types — goes in `extra`, which Sentry does not index
 * as a tag dimension.
 */

/** Why a block would not reach the page. */
export type BlockRenderFailure = 'schema-invalid' | 'missing-renderer';

export interface DegradedBlock {
  blockId: number;
  blockType: string;
  reason: BlockRenderFailure;
}

/** The subset of a site_blocks row this check needs. */
export interface InspectableBlock {
  id: number;
  blockType: string;
  content: unknown;
}

/**
 * Classify every block that will not render.
 *
 * Pure — no Sentry, no I/O — so the unit tests can assert the classification
 * without touching the transport.
 */
export function findDegradedBlocks(
  blocks: readonly InspectableBlock[],
  hasRenderer: (blockType: string) => boolean,
): DegradedBlock[] {
  const degraded: DegradedBlock[] = [];

  for (const block of blocks) {
    // A tombstone is a staged deletion marker, never rendered and never
    // reaching the public read path. Reporting it would be a false positive
    // on every site mid-edit.
    if (block.blockType === TOMBSTONE_BLOCK_TYPE) continue;

    const schema = blockSchemaRegistry[block.blockType as keyof typeof blockSchemaRegistry];
    if (schema === undefined || !hasRenderer(block.blockType)) {
      degraded.push({
        blockId: block.id,
        blockType: block.blockType,
        reason: 'missing-renderer',
      });
      continue;
    }

    if (!schema.safeParse(block.content).success) {
      degraded.push({
        blockId: block.id,
        blockType: block.blockType,
        reason: 'schema-invalid',
      });
    }
  }

  return degraded;
}

/**
 * How long the same degraded state stays quiet after being reported once.
 *
 * The public-site page calls `await headers()`, so the route is fully dynamic:
 * no ISR, no cache, one execution per visitor. Collapsing eleven per-block
 * events into one per request fixes the per-block multiplier but leaves the
 * per-request one, which traffic sets. A single community with a broken
 * `documents` block, crawled by Google, Bing and an uptime monitor, would emit
 * thousands of identical warnings a day — enough to burn Sentry quota and get
 * the alert muted, which is the state this whole change exists to escape.
 *
 * A regression that persists for weeks needs one event an hour to stay visible.
 */
const REPORT_TTL_MS = 60 * 60 * 1000;

/**
 * Bound the map so a pathological spread of distinct degraded states cannot
 * grow it without limit. Well above the number of communities that could
 * plausibly be broken at once; when exceeded, the oldest entries are dropped
 * and those states simply report again.
 */
const MAX_TRACKED_STATES = 500;

/**
 * Per-process, so it dedupes within a serverless instance rather than globally.
 * That is the right trade here: no shared store, no network call on a
 * statutory page's render path, and it still removes the multiplier that
 * matters — one hot instance serving a crawler.
 */
const lastReportedAt = new Map<string, number>();

function shouldReport(key: string, now: number): boolean {
  const previous = lastReportedAt.get(key);
  if (previous !== undefined && now - previous < REPORT_TTL_MS) return false;

  if (lastReportedAt.size >= MAX_TRACKED_STATES) {
    for (const [oldest] of lastReportedAt) {
      lastReportedAt.delete(oldest);
      if (lastReportedAt.size < MAX_TRACKED_STATES) break;
    }
  }
  lastReportedAt.set(key, now);
  return true;
}

/** Exposed so tests can assert the throttle without waiting an hour. */
export function __resetDegradedReportThrottle(): void {
  lastReportedAt.clear();
}

/**
 * Emit at most one `public_site_blocks_degraded` warning per community per
 * distinct degraded state per hour.
 *
 * No-ops when every block is renderable, so a healthy site is silent. The key
 * includes the degraded set, so a site that gets *worse* reports immediately
 * rather than waiting out the window.
 *
 * Never call this for preview renders: a PM mid-edit legitimately has invalid
 * draft content, and reporting it would bury real regressions in noise.
 */
export function reportDegradedBlocks(
  blocks: readonly InspectableBlock[],
  hasRenderer: (blockType: string) => boolean,
  context: { communityId: number; communitySlug: string },
): DegradedBlock[] {
  const degraded = findDegradedBlocks(blocks, hasRenderer);
  if (degraded.length === 0) return degraded;

  const signature = degraded
    .map((d) => `${d.blockId}:${d.reason}`)
    .sort()
    .join(',');
  if (!shouldReport(`${context.communityId}|${signature}`, Date.now())) return degraded;

  captureMessage('public_site_blocks_degraded', {
    level: 'warning',
    extra: {
      ...context,
      totalBlocks: blocks.length,
      degradedCount: degraded.length,
      // Both counts, so a Sentry search can separate "someone shipped a bad
      // schema" from "someone shipped a block type with no renderer".
      schemaInvalidCount: degraded.filter((d) => d.reason === 'schema-invalid').length,
      missingRendererCount: degraded.filter((d) => d.reason === 'missing-renderer').length,
      degraded,
    },
  });

  return degraded;
}
