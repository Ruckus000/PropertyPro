/**
 * Trigram Search — pg_trgm-based entity search for the command palette.
 *
 * Uses word_similarity() with the %> operator for GIN index utilization.
 * All queries run inside a transaction with SET LOCAL for PgBouncer compatibility.
 *
 * This module is internal to @propertypro/db — it accesses `db` directly
 * because pg_trgm operators have no native Drizzle bindings.
 * All user input is parameterized via Drizzle's sql`` tag.
 */
import { sql } from 'drizzle-orm';
import { db } from '../drizzle';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface TrigramSearchResult<T> {
  results: T[];
  totalCount: number;
}

// ---------------------------------------------------------------------------
// Core helper
// ---------------------------------------------------------------------------

/**
 * Execute a callback inside a transaction with pg_trgm threshold set.
 * PgBouncer transaction-mode safe (SET LOCAL scoped to transaction).
 */
async function withTrigramTx<T>(
  callback: (tx: Parameters<Parameters<typeof db.transaction>[0]>[0]) => Promise<T>,
): Promise<T> {
  return db.transaction(async (tx) => {
    await tx.execute(sql`SET LOCAL pg_trgm.word_similarity_threshold = 0.3`);
    return callback(tx);
  });
}

/** Cast raw execute result (postgres RowList) to typed array */
function asRows<T>(result: unknown): T[] {
  return result as T[];
}

// ---------------------------------------------------------------------------
// Document search (trigram on title, tsvector fallback on content)
// ---------------------------------------------------------------------------

export interface DocumentSearchHit {
  id: number;
  title: string;
  category_name: string | null;
  mime_type: string;
  relevance: number;
}

export async function searchDocumentsByTrigram(
  communityId: number,
  query: string,
  limit: number,
): Promise<TrigramSearchResult<DocumentSearchHit>> {
  return withTrigramTx(async (tx) => {
    // Title-first via trigram
    const titleRows = await tx.execute(sql`
      SELECT d.id, d.title,
        dc.name AS category_name,
        d.mime_type,
        word_similarity(${query}, d.title) AS relevance
      FROM documents d
      LEFT JOIN document_categories dc ON dc.id = d.category_id
      WHERE d.community_id = ${communityId}
        AND d.deleted_at IS NULL
        AND d.title %> ${query}
      ORDER BY relevance DESC
      LIMIT ${limit}
    `);

    const titleResults = asRows<DocumentSearchHit>(titleRows);

    // If title matches fill the limit, return them
    if (titleResults.length >= limit) {
      return { results: titleResults, totalCount: titleResults.length };
    }

    // Tsvector fallback on content for remaining slots
    const remaining = limit - titleResults.length;
    const titleIds = titleResults.map((r) => r.id);

    if (titleIds.length > 0) {
      const contentRows = await tx.execute(sql`
        SELECT d.id, d.title,
          dc.name AS category_name,
          d.mime_type,
          ts_rank(
            coalesce(d.search_vector, to_tsvector('english', coalesce(d.search_text, ''))),
            plainto_tsquery('english', ${query})
          ) AS relevance
        FROM documents d
        LEFT JOIN document_categories dc ON dc.id = d.category_id
        WHERE d.community_id = ${communityId}
          AND d.deleted_at IS NULL
          AND d.id != ALL(${titleIds})
          AND coalesce(d.search_vector, to_tsvector('english', coalesce(d.search_text, '')))
            @@ plainto_tsquery('english', ${query})
        ORDER BY relevance DESC
        LIMIT ${remaining}
      `);
      titleResults.push(...asRows<DocumentSearchHit>(contentRows));
    } else {
      const contentRows = await tx.execute(sql`
        SELECT d.id, d.title,
          dc.name AS category_name,
          d.mime_type,
          ts_rank(
            coalesce(d.search_vector, to_tsvector('english', coalesce(d.search_text, ''))),
            plainto_tsquery('english', ${query})
          ) AS relevance
        FROM documents d
        LEFT JOIN document_categories dc ON dc.id = d.category_id
        WHERE d.community_id = ${communityId}
          AND d.deleted_at IS NULL
          AND coalesce(d.search_vector, to_tsvector('english', coalesce(d.search_text, '')))
            @@ plainto_tsquery('english', ${query})
        ORDER BY relevance DESC
        LIMIT ${remaining}
      `);
      titleResults.push(...asRows<DocumentSearchHit>(contentRows));
    }

    return { results: titleResults, totalCount: titleResults.length };
  });
}

// ---------------------------------------------------------------------------
// Announcement search
// ---------------------------------------------------------------------------

export interface AnnouncementSearchHit {
  id: number;
  title: string;
  audience: string;
  published_at: string;
  relevance: number;
}

/**
 * Search announcements. Residents see non-archived, audience-filtered results.
 * Admins see all non-archived announcements.
 */
export async function searchAnnouncementsByTrigram(
  communityId: number,
  query: string,
  limit: number,
  opts?: { isAdmin?: boolean; userAudience?: string },
): Promise<TrigramSearchResult<AnnouncementSearchHit>> {
  const isAdmin = opts?.isAdmin ?? false;

  return withTrigramTx(async (tx) => {
    const rows = isAdmin
      ? await tx.execute(sql`
          SELECT id, title, audience, published_at,
            word_similarity(${query}, title) AS relevance
          FROM announcements
          WHERE community_id = ${communityId}
            AND deleted_at IS NULL
            AND archived_at IS NULL
            AND title %> ${query}
          ORDER BY relevance DESC
          LIMIT ${limit}
        `)
      : await tx.execute(sql`
          SELECT id, title, audience, published_at,
            word_similarity(${query}, title) AS relevance
          FROM announcements
          WHERE community_id = ${communityId}
            AND deleted_at IS NULL
            AND archived_at IS NULL
            AND (audience = 'all' OR audience = ${opts?.userAudience ?? 'all'})
            AND title %> ${query}
          ORDER BY relevance DESC
          LIMIT ${limit}
        `);

    const results = asRows<AnnouncementSearchHit>(rows);
    return { results, totalCount: results.length };
  });
}

// ---------------------------------------------------------------------------
// Meeting search
// ---------------------------------------------------------------------------

export interface MeetingSearchHit {
  id: number;
  title: string;
  meeting_type: string;
  starts_at: string;
  relevance: number;
}

export async function searchMeetingsByTrigram(
  communityId: number,
  query: string,
  limit: number,
): Promise<TrigramSearchResult<MeetingSearchHit>> {
  return withTrigramTx(async (tx) => {
    const rows = await tx.execute(sql`
      SELECT id, title, meeting_type, starts_at,
        word_similarity(${query}, title) AS relevance
      FROM meetings
      WHERE community_id = ${communityId}
        AND deleted_at IS NULL
        AND title %> ${query}
      ORDER BY relevance DESC
      LIMIT ${limit}
    `);

    const results = asRows<MeetingSearchHit>(rows);
    return { results, totalCount: results.length };
  });
}

// ---------------------------------------------------------------------------
// Maintenance request search
// ---------------------------------------------------------------------------

export interface MaintenanceSearchHit {
  id: number;
  title: string;
  status: string;
  priority: string;
  relevance: number;
}

/**
 * Search maintenance requests. Residents see only their own requests.
 * Admins see all community requests.
 */
export async function searchMaintenanceByTrigram(
  communityId: number,
  query: string,
  limit: number,
  opts?: { isAdmin?: boolean; userId?: string },
): Promise<TrigramSearchResult<MaintenanceSearchHit>> {
  const isAdmin = opts?.isAdmin ?? false;

  return withTrigramTx(async (tx) => {
    const rows = isAdmin
      ? await tx.execute(sql`
          SELECT id, title, status, priority,
            word_similarity(${query}, title) AS relevance
          FROM maintenance_requests
          WHERE community_id = ${communityId}
            AND deleted_at IS NULL
            AND title %> ${query}
          ORDER BY relevance DESC
          LIMIT ${limit}
        `)
      : await tx.execute(sql`
          SELECT id, title, status, priority,
            word_similarity(${query}, title) AS relevance
          FROM maintenance_requests
          WHERE community_id = ${communityId}
            AND deleted_at IS NULL
            AND submitted_by_id = ${opts?.userId}
            AND title %> ${query}
          ORDER BY relevance DESC
          LIMIT ${limit}
        `);

    const results = asRows<MaintenanceSearchHit>(rows);
    return { results, totalCount: results.length };
  });
}

// ---------------------------------------------------------------------------
// Violation search
// ---------------------------------------------------------------------------

export interface ViolationSearchHit {
  id: number;
  description: string;
  status: string;
  severity: string;
  relevance: number;
}

/**
 * Search violations. Residents see only violations for their own unit(s).
 * Admins see all community violations.
 */
export async function searchViolationsByTrigram(
  communityId: number,
  query: string,
  limit: number,
  opts?: { isAdmin?: boolean; userId?: string },
): Promise<TrigramSearchResult<ViolationSearchHit>> {
  const isAdmin = opts?.isAdmin ?? false;

  return withTrigramTx(async (tx) => {
    const rows = isAdmin
      ? await tx.execute(sql`
          SELECT id, description, status, severity,
            word_similarity(${query}, description) AS relevance
          FROM violations
          WHERE community_id = ${communityId}
            AND deleted_at IS NULL
            AND description %> ${query}
          ORDER BY relevance DESC
          LIMIT ${limit}
        `)
      : await tx.execute(sql`
          SELECT id, description, status, severity,
            word_similarity(${query}, description) AS relevance
          FROM violations
          WHERE community_id = ${communityId}
            AND deleted_at IS NULL
            AND unit_id IN (
              SELECT unit_id FROM user_roles
              WHERE user_id = ${opts?.userId}
                AND community_id = ${communityId}
                AND unit_id IS NOT NULL
            )
            AND description %> ${query}
          ORDER BY relevance DESC
          LIMIT ${limit}
        `);

    const results = asRows<ViolationSearchHit>(rows);
    return { results, totalCount: results.length };
  });
}

// ---------------------------------------------------------------------------
// Resident search (admin only — hybrid trigram + LIKE prefix)
// ---------------------------------------------------------------------------

export interface ResidentSearchHit {
  id: string;
  full_name: string | null;
  email: string;
  unit_number: string | null;
  role: string;
  relevance: number;
}

/**
 * Search residents. Admin only.
 * Hybrid strategy: trigram on name/email + LIKE prefix on unit_number.
 * @param sanitizedInput — LIKE-escaped query for unit number prefix matching
 */
export async function searchResidentsByTrigram(
  communityId: number,
  query: string,
  sanitizedInput: string,
  limit: number,
): Promise<TrigramSearchResult<ResidentSearchHit>> {
  return withTrigramTx(async (tx) => {
    const likePattern = `${sanitizedInput}%`;

    const rows = await tx.execute(sql`
      SELECT
        usi.user_id AS id,
        usi.email,
        usi.full_name,
        un.unit_number,
        ur.role,
        CASE
          WHEN un.unit_number LIKE ${likePattern} THEN 0.9
          ELSE GREATEST(
            word_similarity(${query}, usi.full_name),
            word_similarity(${query}, usi.email)
          )
        END AS relevance
      FROM user_roles ur
      JOIN public.user_search_index usi ON usi.user_id = ur.user_id
      LEFT JOIN units un ON un.id = ur.unit_id
      WHERE ur.community_id = ${communityId}
        AND (
          usi.full_name %> ${query}
          OR usi.email %> ${query}
          OR un.unit_number LIKE ${likePattern}
        )
      ORDER BY relevance DESC
      LIMIT ${limit}
    `);

    const results = asRows<ResidentSearchHit>(rows);
    return { results, totalCount: results.length };
  });
}
