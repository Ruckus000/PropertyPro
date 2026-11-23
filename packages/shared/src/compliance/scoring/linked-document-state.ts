/**
 * What the compliance rule needs to know about a document a checklist row or
 * a meeting names. Read INCLUDING soft-deleted rows: a deleted document must
 * read as "not posted", which needs its row.
 */
export interface LinkedDocumentState {
  deletedAt: Date | null;
  /** `posted_at` is NULL: owners cannot see it, so it is not posted. */
  isDraft: boolean;
  /** `posted_at`: when owners could first open it. Null for a draft. */
  postedAt?: Date | null;
  /** `received_at`: when the association received or created the record. */
  receivedAt?: Date | null;
}
