/**
 * Reference model and analysis for orphaned objects in the `documents` bucket.
 *
 * Split out of `scripts/report-orphaned-document-objects.ts` for the same
 * reason `site-assets-reference-model.ts` is split out of its script: the
 * script shell must import `@propertypro/db/unsafe`, which throws at module
 * load without a `DATABASE_URL`, so anything imported by a test has to live
 * here instead. This module imports only `@propertypro/db/filters` and
 * `@propertypro/db/constants`, both of which are deliberately free of that
 * dependency (see the comment atop `packages/db/src/constants/index.ts`).
 *
 * ## The reference model, and why it is the load-bearing part
 *
 * SIX distinct writers put objects in this bucket. Finding them took a grep of
 * every `createPresignedUploadUrl('documents'`, `uploadStorageObject(` and
 * `.from('documents')` in the repo — and the naive model, matching only
 * `documents.file_path`, reported 13 live e-sign artifacts in production as
 * orphans.
 *
 *   communities/{id}/documents/{uuid}/{file}   documents.file_path
 *   communities/{id}/branding/{name}           communities.branding->>'logoPath'
 *                                              communities.branding->>'siteLogoPath'
 *                                              communities.logo_path (pre-JSONB column; the
 *                                              JSONB supersedes it, but both can be live)
 *   communities/{id}/esign-templates/{...}     esign_templates.source_document_path
 *                                              esign_submissions.source_document_path
 *   communities/{id}/esign-signed/{sid}/{...}  esign_submissions.signed_document_path
 *                                              esign_submissions.audit_certificate_path
 *   authored-assets/{cid}/{draftId}/{...}      NOT MODELLED — see below
 *   demo/… and transparency/…                  documents.file_path (seed-era paths)
 *
 * `documents.file_path` is matched against ALL rows, with NO `deleted_at`
 * filter. A soft-deleted document's object is not an orphan: the row still
 * describes it and a board can restore it. Adding that filter would make this
 * script recommend deleting the bytes of every document sitting in the Deleted
 * column — which is why the test asserts the absence of the filter directly
 * against the query text.
 *
 * ## `authored-assets/` is reported separately and never called an orphan
 *
 * The draft editor writes images to `authored-assets/{cid}/{draftId}/…` and
 * references them only as a signed URL embedded inside `body_html`. That
 * reference is a substring of a document, not a column, so there is no
 * complete way to resolve it here. Rather than guess, these get their own
 * counter and are excluded from the orphan set. A model that under-reports is
 * recoverable; one that over-reports gets files deleted by whoever trusts it.
 *
 * ## Two path shapes are indistinguishable, and the report says so
 *
 * `processAndStoreBrandingImage` presigns its RAW logo source through the same
 * `/api/v1/upload` route, so it lands at
 * `communities/{id}/documents/{uuid}/{file}` — identical in shape to a document
 * upload. It is then downloaded, resized, written to the canonical
 * `communities/{id}/branding/…` with `upsert: true`, and the raw source is
 * never deleted. So an unknown share of that prefix's orphans were never failed
 * uploads at all; they are residue from a completely successful logo save.
 * Nothing in the path distinguishes them, and this module does not pretend
 * otherwise — hence the single `document-or-branding-raw` kind.
 */
import { sql, type SQL } from '@propertypro/db/filters';
import { DOCUMENTS_BUCKET } from '@propertypro/db/constants';

/** What kind of object a path denotes, derived from its shape alone. */
export type ObjectKind =
  | 'document-or-branding-raw'
  | 'branding-canonical'
  | 'esign-template'
  | 'esign-signed'
  | 'authored-asset'
  | 'seed-or-legacy';

export const KIND_NOTES: Record<ObjectKind, string> = {
  'document-or-branding-raw':
    'a failed document-metadata write OR a raw logo source — the path cannot tell them apart',
  'branding-canonical': 'a processed logo no community row points at',
  'esign-template': 'an e-sign source PDF no template or submission points at',
  'esign-signed': 'a signed PDF or audit certificate no submission points at',
  'authored-asset': 'draft-editor image (never reported as an orphan)',
  'seed-or-legacy': 'a seed-era or legacy path with no documents row',
};

export interface StorageObjectRow {
  name: string;
  bytes: string | number | null;
  created_at: Date | string;
}

export interface CommunityRow {
  id: number | string;
  slug: string;
}

export interface ReferencePathRow {
  path: string;
}

export interface OrphanObject {
  path: string;
  bytes: number;
  createdAt: Date;
  kind: ObjectKind;
  communityId: number | null;
}

export interface CommunityOrphanGroup {
  /** `null` for paths carrying no community segment (seed/legacy shapes). */
  communityId: number | null;
  /** `null` when the community row no longer exists — see `communityRowMissing`. */
  slug: string | null;
  /**
   * True when the path names a community id with no row. `documents.community_id`
   * is `ON DELETE cascade`, so hard-deleting a community removes its `documents`
   * rows and strands the bytes with nothing left to describe them. That is a
   * different cause from a failed metadata write, and a different decision, so
   * the report keeps the two apart rather than summing them.
   */
  communityRowMissing: boolean;
  orphanCount: number;
  orphanBytes: number;
  orphans: OrphanObject[];
}

export interface OrphanReportResult {
  bucket: string;
  totalObjects: number;
  referencedObjects: number;
  referencePathCount: number;
  communityCount: number;
  /** Objects skipped because they are newer than the cutoff. */
  tooNewObjects: number;
  /** `authored-assets/` objects — unmodelled, never counted as orphans. */
  unmodelledObjects: number;
  unmodelledBytes: number;
  orphanCount: number;
  orphanBytes: number;
  groups: CommunityOrphanGroup[];
}

export interface AnalyzeOrphansInput {
  objects: StorageObjectRow[];
  communities: CommunityRow[];
  references: ReferencePathRow[];
  /**
   * Ignore objects created less than this many hours ago. An upload that is
   * mid-flight — presigned and PUT, metadata not yet written — is legitimately
   * unreferenced for a moment, and calling it an orphan would race the request
   * about to reference it. The presign TTL is 15 minutes, so 24 hours is
   * generous on purpose.
   */
  maxAgeHours?: number;
  /** Injectable so the age cutoff is testable without freezing the clock. */
  now?: Date;
}

/** Every object in the bucket, with its size and age. */
export function storageObjectsQuery(): SQL {
  return sql`
    SELECT
      name,
      COALESCE((metadata ->> 'size')::bigint, 0) AS bytes,
      created_at
    FROM storage.objects
    WHERE bucket_id = ${DOCUMENTS_BUCKET}
  `;
}

/**
 * Every community, including soft-deleted ones.
 *
 * No `deleted_at` filter: a soft-deleted community still owns its records, and
 * excluding it here would relabel every one of its objects as
 * `communityRowMissing` — which claims a hard delete that did not happen.
 */
export function communitiesQuery(): SQL {
  return sql`SELECT id, slug FROM communities`;
}

/**
 * Every path any live row points at, unioned across all six writers.
 *
 * Deliberately NO `deleted_at` filter on `documents` — see the module header.
 */
export function referencePathsQuery(): SQL {
  return sql`
    SELECT file_path AS path FROM documents WHERE file_path IS NOT NULL
    UNION SELECT branding ->> 'logoPath' FROM communities WHERE branding ->> 'logoPath' IS NOT NULL
    UNION SELECT branding ->> 'siteLogoPath' FROM communities WHERE branding ->> 'siteLogoPath' IS NOT NULL
    UNION SELECT logo_path FROM communities WHERE logo_path IS NOT NULL
    UNION SELECT source_document_path FROM esign_templates WHERE source_document_path IS NOT NULL
    UNION SELECT source_document_path FROM esign_submissions WHERE source_document_path IS NOT NULL
    UNION SELECT signed_document_path FROM esign_submissions WHERE signed_document_path IS NOT NULL
    UNION SELECT audit_certificate_path FROM esign_submissions WHERE audit_certificate_path IS NOT NULL
  `;
}

const COMMUNITY_SEGMENT = /^communities\/(\d+)\//;

/** Classify a path by shape alone. Pure. */
export function classifyObjectPath(path: string): {
  kind: ObjectKind;
  communityId: number | null;
} {
  if (path.startsWith('authored-assets/')) {
    return { kind: 'authored-asset', communityId: parseAuthoredAssetCommunity(path) };
  }

  const match = COMMUNITY_SEGMENT.exec(path);
  if (!match) return { kind: 'seed-or-legacy', communityId: null };

  const communityId = Number(match[1]);
  const rest = path.slice(match[0].length);

  if (rest.startsWith('documents/')) return { kind: 'document-or-branding-raw', communityId };
  if (rest.startsWith('branding/')) return { kind: 'branding-canonical', communityId };
  if (rest.startsWith('esign-templates/')) return { kind: 'esign-template', communityId };
  if (rest.startsWith('esign-signed/')) return { kind: 'esign-signed', communityId };

  // A shape none of the six known writers produces. Classified as
  // seed-or-legacy rather than as its own error state, because it is still
  // covered by the `documents.file_path` reference source — which is what the
  // seed paths (`demo/…`, `transparency/…`) use.
  return { kind: 'seed-or-legacy', communityId };
}

function parseAuthoredAssetCommunity(path: string): number | null {
  const segment = path.split('/')[1];
  if (segment === undefined || !/^\d+$/.test(segment)) return null;
  return Number(segment);
}

function toNumber(value: string | number | null): number {
  if (value === null) return 0;
  return typeof value === 'number' ? value : Number(value);
}

/**
 * Compare the bucket against the reference model.
 *
 * Throws when it examined nothing. `.claude/rules/verification.md`: "Assert a
 * non-zero population. A scan that examined nothing must not pass." An empty
 * bucket or an empty community list means a wrong bucket name or a wrong
 * database — both of which would otherwise print a cheerful "no orphans", which
 * is the exact vacuous green that rule exists to prevent.
 */
export function analyzeOrphans(input: AnalyzeOrphansInput): OrphanReportResult {
  const { objects, communities, references, maxAgeHours = 24, now = new Date() } = input;

  if (objects.length === 0) {
    throw new Error(
      `examined nothing: bucket "${DOCUMENTS_BUCKET}" returned zero objects — ` +
        'that is a wrong bucket name or a wrong database, not a clean result',
    );
  }
  if (communities.length === 0) {
    throw new Error('examined nothing: zero communities returned — wrong database?');
  }

  const referenced = new Set(references.map((row) => row.path));
  const slugById = new Map<number, string>(communities.map((row) => [Number(row.id), row.slug]));
  const cutoff = new Date(now.getTime() - maxAgeHours * 60 * 60 * 1000);

  let referencedObjects = 0;
  let tooNewObjects = 0;
  let unmodelledObjects = 0;
  let unmodelledBytes = 0;
  const byCommunity = new Map<string, CommunityOrphanGroup>();

  for (const row of objects) {
    const bytes = toNumber(row.bytes);
    const createdAt = row.created_at instanceof Date ? row.created_at : new Date(row.created_at);
    const { kind, communityId } = classifyObjectPath(row.name);

    if (referenced.has(row.name)) {
      referencedObjects += 1;
      continue;
    }

    // Counted BEFORE the age check, so the figure covers every unmodelled
    // object rather than only the old ones. They are not orphans either way.
    if (kind === 'authored-asset') {
      unmodelledObjects += 1;
      unmodelledBytes += bytes;
      continue;
    }

    if (createdAt > cutoff) {
      tooNewObjects += 1;
      continue;
    }

    const key = communityId === null ? 'none' : String(communityId);
    let group = byCommunity.get(key);
    if (!group) {
      group = {
        communityId,
        slug: communityId === null ? null : slugById.get(communityId) ?? null,
        communityRowMissing: communityId !== null && !slugById.has(communityId),
        orphanCount: 0,
        orphanBytes: 0,
        orphans: [],
      };
      byCommunity.set(key, group);
    }

    group.orphanCount += 1;
    group.orphanBytes += bytes;
    group.orphans.push({ path: row.name, bytes, createdAt, kind, communityId });
  }

  const groups = [...byCommunity.values()].sort((a, b) => b.orphanBytes - a.orphanBytes);

  return {
    bucket: DOCUMENTS_BUCKET,
    totalObjects: objects.length,
    referencedObjects,
    referencePathCount: referenced.size,
    communityCount: communities.length,
    tooNewObjects,
    unmodelledObjects,
    unmodelledBytes,
    orphanCount: groups.reduce((sum, g) => sum + g.orphanCount, 0),
    orphanBytes: groups.reduce((sum, g) => sum + g.orphanBytes, 0),
    groups,
  };
}

// ---------------------------------------------------------------------------
// CLI argument parsing
// ---------------------------------------------------------------------------

export interface ReportCliOptions {
  asJson: boolean;
  maxAgeHours?: number;
}

const BOOLEAN_FLAGS = new Set(['--json']);
const VALUE_FLAGS = new Set(['--max-age-hours']);

/**
 * Parse the report's argv, rejecting anything it does not recognise.
 *
 * Lives here rather than in the script so it is testable: the script imports
 * `@propertypro/db/unsafe`, which throws at module load without a DATABASE_URL.
 *
 * THROWS ON AN UNRECOGNISED TOKEN, deliberately. The previous version matched
 * only `--name=value` and ignored everything else, so `--max-age-hours 720`
 * (space form) and `--max-age-hourz=720` (typo) both silently fell back to the
 * 24h default and over-reported recent uploads as orphans — the exact direction
 * the module header warns about. `reconcile-site-assets-usage.ts` states the
 * principle: a safety setting you can turn off with a typo is not a safety
 * setting. It matters more here than there, because this report is the only
 * instrument left for deciding what to delete.
 */
export function parseReportArgs(args: readonly string[]): ReportCliOptions {
  const options: ReportCliOptions = { asJson: false };

  for (let i = 0; i < args.length; i += 1) {
    const arg = args[i] as string;

    if (BOOLEAN_FLAGS.has(arg)) {
      options.asJson = true;
      continue;
    }

    const eq = arg.indexOf('=');
    const name = eq === -1 ? arg : arg.slice(0, eq);

    if (!VALUE_FLAGS.has(name)) {
      throw new Error(
        `unrecognised argument "${arg}". Known flags: ${[...BOOLEAN_FLAGS, ...VALUE_FLAGS].join(', ')}`,
      );
    }

    // Accept both `--name=value` and `--name value`; the space form silently
    // did nothing before.
    const raw = eq === -1 ? args[(i += 1)] : arg.slice(eq + 1);
    if (raw === undefined) {
      throw new Error(`${name} needs a value`);
    }

    const value = Number(raw);
    if (!Number.isFinite(value) || value < 0) {
      throw new Error(`${name} must be a non-negative number; got "${raw}"`);
    }
    options.maxAgeHours = value;
  }

  return options;
}
