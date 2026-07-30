/**
 * Publish history for a community's public site (website editor v3, Phase 6).
 *
 * One row per successful publish, written inside the same transaction as the
 * publish itself, so a rolled-back publish leaves no history behind and the log
 * cannot claim something happened that did not.
 *
 * WHAT THIS IS FOR. Two things, gated differently by decision 5 of the v3 gap
 * analysis: one-step revert is available on EVERY plan (a PM who breaks their
 * public site must be able to undo it), while the full audit log is
 * Professional-only. The gate belongs on reading the list, not on the revert.
 *
 * RLS POSTURE — `service_only`, and this is the security decision of the phase.
 * `site_blocks` uses `public_read_service_write` because the public site reads
 * it anonymously. Snapshots must NOT follow it: `snapshot` contains the full
 * block payload of a past publish, and an anon read of this table would hand
 * out site content the association may since have deliberately taken down.
 * Nothing outside the service role has any business reading it. Trigger-exempt
 * for the same reason `site_blocks` is: every write is service-role, so there
 * is no authenticated write path for the write-scope trigger to police.
 *
 * RETENTION (decision 12). `snapshot` is NULLABLE and pruned by the daily
 * lifecycle cron beyond the most recent N publishes; the log ROW persists
 * indefinitely. Rows are small, and on a statutory site "what did the public
 * page show in March" is worth being able to answer. Revert is therefore
 * offered only where `snapshot IS NOT NULL`, and the UI has to distinguish a
 * restorable version from a logged-only one rather than failing at the click.
 */
import {
  bigint,
  bigserial,
  index,
  integer,
  jsonb,
  pgTable,
  timestamp,
  uuid,
} from 'drizzle-orm/pg-core';
import { communities } from './communities';

/**
 * The stored payload shape. Mirrors what `publishCommunitySite` promoted, so a
 * revert can rewrite the draft layer from it without re-deriving anything.
 *
 * VERSIONED, because production already holds rows written before Phase 11b
 * added pages. A v1 payload has NO `version` field — that absence is the
 * discriminator, and it is why `version` is a literal `2` rather than a number:
 * an older row can never be mistaken for a newer one.
 *
 * A reader must handle both. `blocks` is present and identically shaped in each,
 * so the only real difference is that v1 cannot say which page a block belonged
 * to — for those rows every block is the home page's, which is true by
 * construction: v1 predates the existence of a second page.
 */
export interface SitePublishSnapshotBlockV1 {
  blockOrder: number;
  blockType: string;
  content: unknown;
}

export interface SitePublishSnapshotPayloadV1 {
  version?: undefined;
  blocks: SitePublishSnapshotBlockV1[];
}

/**
 * One page as it existed at publish time.
 *
 * This MANIFEST is the point of v2, not the `pageId` on each block. Without it a
 * revert cannot recreate a page that has since been deleted — it would restore
 * orphaned blocks pointing at nothing, or silently drop them. The name/slug are
 * what make the page reconstructible; `isHome` is what stops a revert creating a
 * second one.
 */
export interface SitePublishSnapshotPage {
  pageId: number;
  name: string;
  slug: string;
  inNav: boolean;
  sortOrder: number;
  isHome: boolean;
}

export interface SitePublishSnapshotPayloadV2 {
  version: 2;
  pages: SitePublishSnapshotPage[];
  blocks: (SitePublishSnapshotBlockV1 & { pageId: number })[];
}

export type SitePublishSnapshotPayload =
  | SitePublishSnapshotPayloadV1
  | SitePublishSnapshotPayloadV2;

export const sitePublishSnapshots = pgTable(
  'site_publish_snapshots',
  {
    id: bigserial('id', { mode: 'number' }).primaryKey(),
    communityId: bigint('community_id', { mode: 'number' })
      .notNull()
      .references(() => communities.id, { onDelete: 'cascade' }),
    /**
     * The `published_at` stamp this publish wrote across every promoted row —
     * the same value that serves as the optimistic-concurrency token, so a
     * history entry can be correlated with the site state it produced.
     */
    publishedAt: timestamp('published_at', { withTimezone: true }).notNull(),
    /**
     * Who published. No FK: this references `auth.users`, a different schema
     * that drizzle cannot express. The constraint is added in the raw SQL
     * migration instead — same convention as `user_search_index`.
     */
    actorUserId: uuid('actor_user_id'),
    /** How many changes this publish carried, for the history list. */
    changeCount: integer('change_count').notNull().default(0),
    /**
     * Human labels for what changed, so the history list can be rendered
     * WITHOUT reading `snapshot` — which matters because the list endpoint
     * deliberately never returns the payload.
     */
    changeLabels: jsonb('change_labels').$type<string[]>(),
    /**
     * The published block payload. NULL once pruned — see RETENTION above.
     * Revert is unavailable for a row whose snapshot is null.
     */
    snapshot: jsonb('snapshot').$type<SitePublishSnapshotPayload>(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
    deletedAt: timestamp('deleted_at', { withTimezone: true }),
  },
  (table) => [
    // The history list is "this community's publishes, newest first"; the
    // retention sweep is the same scan in the other direction.
    index('site_publish_snapshots_community_published_idx').on(
      table.communityId,
      table.publishedAt,
    ),
  ],
);
