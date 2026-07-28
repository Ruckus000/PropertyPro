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
 * events on every page view, from every visitor, forever. Sited here it is
 * one event per request carrying all of them, and none at all when the page
 * is healthy.
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
 * Emit at most one `public_site_blocks_degraded` warning for this request.
 *
 * No-ops when every block is renderable, so a healthy site is silent.
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
