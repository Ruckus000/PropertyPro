import {
  clampPageSize,
  createScopedClient,
  forumReplies,
  forumThreads,
  listDeletedForumRepliesForThread,
  logAuditEvent,
  paginate,
  polls,
  pollVotes,
  type PaginatedResult,
  type PollType,
} from '@propertypro/db';
import { and, asc, desc, eq, gt, isNull, lt, or } from '@propertypro/db/filters';
import { AppError } from '@/lib/api/errors/AppError';
import {
  BadRequestError,
  ForbiddenError,
  NotFoundError,
  UnprocessableEntityError,
} from '@/lib/api/errors';

export interface PollRecord {
  [key: string]: unknown;
  id: number;
  communityId: number;
  title: string;
  description: string | null;
  pollType: PollType;
  options: string[];
  endsAt: Date | null;
  createdByUserId: string | null;
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
}

interface PollVoteRecord {
  [key: string]: unknown;
  id: number;
  communityId: number;
  pollId: number;
  userId: string;
  selectedOptions: string[];
  createdAt: Date;
}

interface ForumThreadRecord {
  [key: string]: unknown;
  id: number;
  communityId: number;
  title: string;
  body: string;
  authorUserId: string;
  isPinned: boolean;
  isLocked: boolean;
  createdAt: Date;
  updatedAt: Date;
}

interface ForumReplyRecord {
  [key: string]: unknown;
  id: number;
  communityId: number;
  threadId: number;
  body: string;
  authorUserId: string;
  createdAt: Date;
  updatedAt: Date;
  deletedAt: Date | null;
}

export interface CreatePollInput {
  title: string;
  description?: string | null;
  pollType: PollType;
  options: string[];
  endsAt?: string | null;
}

export interface CastVoteInput {
  selectedOptions: string[];
}

export interface PollResults {
  poll: PollRecord;
  totalVotes: number;
  options: Array<{
    option: string;
    votes: number;
    percentage: number;
  }>;
}

export interface PollMyVote {
  hasVoted: boolean;
  selectedOptions: string[];
}

export interface CreateForumThreadInput {
  title: string;
  body: string;
}

export interface UpdateForumThreadInput {
  title?: string;
  body?: string;
  isPinned?: boolean;
  isLocked?: boolean;
}

export interface PaginatedForumThreads {
  data: ForumThreadRecord[];
  pagination: PaginatedResult<ForumThreadRecord>['pagination'];
}

interface ForumThreadOrderedCursorPayload {
  isPinned: boolean;
  createdAt: string;
  id: number;
}

const VALID_POLL_TYPES: readonly PollType[] = ['single_choice', 'multiple_choice'];

function hasPostgresErrorCode(error: unknown, expectedCode: string): boolean {
  if (typeof error !== 'object' || error === null) {
    return false;
  }

  if ('code' in error && (error as { code: unknown }).code === expectedCode) {
    return true;
  }

  if ('cause' in error) {
    return hasPostgresErrorCode((error as { cause: unknown }).cause, expectedCode);
  }

  return false;
}

function isUniqueConstraintError(error: unknown): boolean {
  return hasPostgresErrorCode(error, '23505');
}

function assertPollType(value: string): PollType {
  if (!VALID_POLL_TYPES.includes(value as PollType)) {
    throw new UnprocessableEntityError(`Invalid poll type: ${value}`);
  }
  return value as PollType;
}

function normalizePollOptions(options: string[]): string[] {
  if (!Array.isArray(options)) {
    throw new BadRequestError('options must be an array');
  }

  const normalized = options
    .map((option) => option.trim())
    .filter((option) => option.length > 0);

  if (normalized.length < 2) {
    throw new UnprocessableEntityError('Polls must include at least two non-empty options');
  }

  const deduped = [...new Set(normalized)];
  if (deduped.length !== normalized.length) {
    throw new UnprocessableEntityError('Poll options must be unique');
  }

  return deduped;
}

function parseOptionalEndDate(value: string | null | undefined): Date | null {
  if (!value) {
    return null;
  }

  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    throw new BadRequestError('endsAt must be a valid ISO timestamp');
  }

  return parsed;
}

export function mapPollRow(row: PollRecord): PollRecord {
  return {
    ...row,
    pollType: assertPollType(row.pollType),
    options: Array.isArray(row.options) ? row.options.map((option) => String(option)) : [],
  };
}

function mapVoteRow(row: PollVoteRecord): PollVoteRecord {
  return {
    ...row,
    selectedOptions: Array.isArray(row.selectedOptions)
      ? row.selectedOptions.map((option) => String(option))
      : [],
  };
}

function mapForumThreadRow(row: ForumThreadRecord): ForumThreadRecord {
  return {
    ...row,
    isPinned: Boolean(row.isPinned),
    isLocked: Boolean(row.isLocked),
  };
}

function encodeForumThreadOrderedCursor(payload: ForumThreadOrderedCursorPayload): string {
  return Buffer.from(JSON.stringify(payload), 'utf8').toString('base64url');
}

function decodeForumThreadOrderedCursor(
  cursor: string | null | undefined,
): ForumThreadOrderedCursorPayload | null {
  if (!cursor) return null;

  try {
    const parsed: unknown = JSON.parse(Buffer.from(cursor, 'base64url').toString('utf8'));
    if (
      typeof parsed === 'object' &&
      parsed !== null &&
      typeof (parsed as { isPinned?: unknown }).isPinned === 'boolean' &&
      typeof (parsed as { createdAt?: unknown }).createdAt === 'string' &&
      Number.isInteger((parsed as { id?: unknown }).id)
    ) {
      const createdAt = new Date((parsed as { createdAt: string }).createdAt);
      if (Number.isNaN(createdAt.getTime())) {
        return null;
      }
      return {
        isPinned: (parsed as { isPinned: boolean }).isPinned,
        createdAt: createdAt.toISOString(),
        id: (parsed as { id: number }).id,
      };
    }
  } catch {
    return null;
  }

  return null;
}

function buildForumThreadOrderedCursorWhere(
  cursor: ForumThreadOrderedCursorPayload | null,
) {
  if (!cursor) return undefined;

  const createdAt = new Date(cursor.createdAt);
  return or(
    lt(forumThreads.isPinned, cursor.isPinned),
    and(
      eq(forumThreads.isPinned, cursor.isPinned),
      or(
        lt(forumThreads.createdAt, createdAt),
        and(
          eq(forumThreads.createdAt, createdAt),
          lt(forumThreads.id, cursor.id),
        ),
      ),
    ),
  );
}

function mapForumReplyRow(row: ForumReplyRecord): ForumReplyRecord {
  return {
    ...row,
    body: row.deletedAt ? '' : row.body,
    deletedAt: row.deletedAt ?? null,
  };
}

function validateVoteSelection(poll: PollRecord, selectedOptions: string[]): string[] {
  const normalized = selectedOptions
    .map((option) => option.trim())
    .filter((option) => option.length > 0);

  if (normalized.length === 0) {
    throw new UnprocessableEntityError('At least one option must be selected');
  }

  if (poll.pollType === 'single_choice' && normalized.length !== 1) {
    throw new UnprocessableEntityError('Single-choice poll accepts exactly one selected option');
  }

  const uniqueSelections = [...new Set(normalized)];
  if (uniqueSelections.length !== normalized.length) {
    throw new UnprocessableEntityError('Duplicate selected options are not allowed');
  }

  const invalid = uniqueSelections.filter((option) => !poll.options.includes(option));
  if (invalid.length > 0) {
    throw new UnprocessableEntityError('Selected options must exist in poll options');
  }

  return uniqueSelections;
}

export async function createPollForCommunity(
  communityId: number,
  actorUserId: string,
  input: CreatePollInput,
  requestId?: string | null,
): Promise<PollRecord> {
  const scoped = createScopedClient(communityId);
  const options = normalizePollOptions(input.options);
  const endsAt = parseOptionalEndDate(input.endsAt);

  if (endsAt && endsAt.getTime() <= Date.now()) {
    throw new UnprocessableEntityError('endsAt must be in the future');
  }

  const [inserted] = await scoped.insert(polls, {
    title: input.title.trim(),
    description: input.description ?? null,
    pollType: assertPollType(input.pollType),
    options,
    endsAt,
    createdByUserId: actorUserId,
    isActive: true,
  });

  if (!inserted) {
    throw new Error('Failed to create poll');
  }

  const created = mapPollRow(inserted as unknown as PollRecord);
  await logAuditEvent({
    userId: actorUserId,
    action: 'create',
    resourceType: 'poll',
    resourceId: String(created.id),
    communityId,
    newValues: created,
    metadata: { requestId: requestId ?? null },
  });

  return created;
}

export async function castPollVoteForCommunity(
  communityId: number,
  pollId: number,
  actorUserId: string,
  input: CastVoteInput,
  requestId?: string | null,
): Promise<PollVoteRecord> {
  const scoped = createScopedClient(communityId);

  const pollRows = await scoped.selectFrom<PollRecord>(polls, {}, eq(polls.id, pollId));
  const poll = pollRows[0];
  if (!poll) {
    throw new NotFoundError('Poll not found');
  }

  const mappedPoll = mapPollRow(poll);
  if (!mappedPoll.isActive) {
    throw new UnprocessableEntityError('Poll is not active');
  }

  if (mappedPoll.endsAt && mappedPoll.endsAt.getTime() <= Date.now()) {
    throw new UnprocessableEntityError('Poll has ended');
  }

  const selectedOptions = validateVoteSelection(mappedPoll, input.selectedOptions);

  try {
    const [inserted] = await scoped.insert(pollVotes, {
      pollId,
      userId: actorUserId,
      selectedOptions,
    });

    if (!inserted) {
      throw new Error('Failed to cast vote');
    }

    const created = mapVoteRow(inserted as unknown as PollVoteRecord);
    await logAuditEvent({
      userId: actorUserId,
      action: 'create',
      resourceType: 'poll_vote',
      resourceId: String(created.id),
      communityId,
      newValues: created,
      metadata: { requestId: requestId ?? null },
    });

    return created;
  } catch (error) {
    if (isUniqueConstraintError(error)) {
      throw new AppError('You have already voted in this poll', 409, 'CONFLICT');
    }
    throw error;
  }
}

export async function getPollResultsForCommunity(
  communityId: number,
  pollId: number,
): Promise<PollResults> {
  const scoped = createScopedClient(communityId);
  const pollRows = await scoped.selectFrom<PollRecord>(polls, {}, eq(polls.id, pollId));
  const poll = pollRows[0];

  if (!poll) {
    throw new NotFoundError('Poll not found');
  }

  const mappedPoll = mapPollRow(poll);
  const votes = await scoped
    .selectFrom<PollVoteRecord>(pollVotes, {}, eq(pollVotes.pollId, pollId))
    .orderBy(asc(pollVotes.createdAt));

  const counts = new Map<string, number>();
  for (const option of mappedPoll.options) {
    counts.set(option, 0);
  }

  for (const vote of votes.map(mapVoteRow)) {
    for (const selected of vote.selectedOptions) {
      if (counts.has(selected)) {
        counts.set(selected, (counts.get(selected) ?? 0) + 1);
      }
    }
  }

  const totalVotes = votes.length;
  return {
    poll: mappedPoll,
    totalVotes,
    options: mappedPoll.options.map((option) => {
      const votesForOption = counts.get(option) ?? 0;
      const percentage = totalVotes === 0 ? 0 : Number(((votesForOption / totalVotes) * 100).toFixed(2));
      return {
        option,
        votes: votesForOption,
        percentage,
      };
    }),
  };
}

export async function getMyPollVoteForCommunity(
  communityId: number,
  pollId: number,
  actorUserId: string,
): Promise<PollMyVote> {
  const scoped = createScopedClient(communityId);
  const rows = await scoped.selectFrom<PollVoteRecord>(
    pollVotes,
    {
      id: pollVotes.id,
      selectedOptions: pollVotes.selectedOptions,
      createdAt: pollVotes.createdAt,
    },
    and(eq(pollVotes.pollId, pollId), eq(pollVotes.userId, actorUserId)),
  );

  const vote = rows[0];
  if (!vote) {
    return {
      hasVoted: false,
      selectedOptions: [],
    };
  }

  return {
    hasVoted: true,
    selectedOptions: mapVoteRow(vote).selectedOptions,
  };
}

export async function createForumThreadForCommunity(
  communityId: number,
  actorUserId: string,
  input: CreateForumThreadInput,
  requestId?: string | null,
): Promise<ForumThreadRecord> {
  const scoped = createScopedClient(communityId);
  const [inserted] = await scoped.insert(forumThreads, {
    title: input.title.trim(),
    body: input.body.trim(),
    authorUserId: actorUserId,
    isPinned: false,
    isLocked: false,
  });

  if (!inserted) {
    throw new Error('Failed to create forum thread');
  }

  const created = mapForumThreadRow(inserted as unknown as ForumThreadRecord);
  await logAuditEvent({
    userId: actorUserId,
    action: 'create',
    resourceType: 'forum_thread',
    resourceId: String(created.id),
    communityId,
    newValues: created,
    metadata: { requestId: requestId ?? null },
  });

  return created;
}

/**
 * Ordered-keyset paginated forum thread list.
 *
 * Sort contract:
 *   ORDER BY is_pinned DESC, created_at DESC, id DESC
 *
 * AUTHZ: tenant-scoped - caller MUST have already verified the actor's
 * community membership and community-board read gates.
 */
export async function paginateForumThreadsForCommunity(params: {
  communityId: number;
  cursor?: string;
  pageSize?: number;
}): Promise<PaginatedForumThreads> {
  const pageSize = clampPageSize(params.pageSize);
  const cursorWhere = buildForumThreadOrderedCursorWhere(
    decodeForumThreadOrderedCursor(params.cursor),
  );
  const scoped = createScopedClient(params.communityId);
  const rows = await scoped
    .selectFrom<ForumThreadRecord>(forumThreads, {}, cursorWhere)
    .orderBy(desc(forumThreads.isPinned), desc(forumThreads.createdAt), desc(forumThreads.id))
    .limit(pageSize + 1);

  const hasMore = rows.length > pageSize;
  const dataRows = hasMore ? rows.slice(0, pageSize) : rows;
  const lastRow = dataRows[dataRows.length - 1];
  const nextCursor =
    hasMore && lastRow
      ? encodeForumThreadOrderedCursor({
          isPinned: Boolean(lastRow.isPinned),
          createdAt: lastRow.createdAt.toISOString(),
          id: lastRow.id,
        })
      : null;

  return {
    data: dataRows.map(mapForumThreadRow),
    pagination: {
      nextCursor,
      hasMore: nextCursor !== null,
      pageSize,
    },
  };
}

export async function getForumThreadWithRepliesForCommunity(
  communityId: number,
  threadId: number,
): Promise<{
  thread: ForumThreadRecord;
  replies: ForumReplyRecord[];
}> {
  const scoped = createScopedClient(communityId);
  const threadRows = await scoped.selectFrom<ForumThreadRecord>(forumThreads, {}, eq(forumThreads.id, threadId));
  const thread = threadRows[0];
  if (!thread) {
    throw new NotFoundError('Forum thread not found');
  }

  const replies = await scoped
    .selectFrom<ForumReplyRecord>(forumReplies, {}, eq(forumReplies.threadId, threadId))
    .orderBy(asc(forumReplies.createdAt));
  const deletedReplies = await listDeletedForumRepliesForThread(communityId, threadId);
  const allReplies = [...replies, ...deletedReplies].sort(
    (left, right) => left.createdAt.getTime() - right.createdAt.getTime(),
  );

  return {
    thread: mapForumThreadRow(thread),
    replies: allReplies.map(mapForumReplyRow),
  };
}

export async function createForumReplyForCommunity(
  communityId: number,
  threadId: number,
  actorUserId: string,
  body: string,
  requestId?: string | null,
): Promise<ForumReplyRecord> {
  const scoped = createScopedClient(communityId);
  const threadRows = await scoped.selectFrom<ForumThreadRecord>(forumThreads, {}, eq(forumThreads.id, threadId));
  const thread = threadRows[0];
  if (!thread) {
    throw new NotFoundError('Forum thread not found');
  }

  if (thread.isLocked) {
    throw new ForbiddenError('Thread is locked');
  }

  const [inserted] = await scoped.insert(forumReplies, {
    threadId,
    body: body.trim(),
    authorUserId: actorUserId,
  });

  if (!inserted) {
    throw new Error('Failed to create forum reply');
  }

  const created = mapForumReplyRow(inserted as unknown as ForumReplyRecord);
  await logAuditEvent({
    userId: actorUserId,
    action: 'create',
    resourceType: 'forum_reply',
    resourceId: String(created.id),
    communityId,
    newValues: created,
    metadata: { requestId: requestId ?? null },
  });

  return created;
}

export async function deleteForumReplyForCommunity(
  communityId: number,
  threadId: number,
  replyId: number,
  actorUserId: string,
  canModerateReplies: boolean,
  requestId?: string | null,
  moderationReason?: string | null,
): Promise<void> {
  const scoped = createScopedClient(communityId);
  const existingRows = await scoped.selectFrom<ForumReplyRecord>(
    forumReplies,
    {},
    and(eq(forumReplies.id, replyId), eq(forumReplies.threadId, threadId)),
  );
  const existing = existingRows[0];

  if (!existing) {
    throw new NotFoundError('Forum reply not found');
  }

  const isAuthorDelete = existing.authorUserId === actorUserId;
  if (!isAuthorDelete && !canModerateReplies) {
    throw new ForbiddenError('You can only delete your own reply');
  }

  await scoped.softDelete(
    forumReplies,
    and(eq(forumReplies.id, replyId), eq(forumReplies.threadId, threadId)),
  );

  await logAuditEvent({
    userId: actorUserId,
    action: 'delete',
    resourceType: 'forum_reply',
    resourceId: String(replyId),
    communityId,
    oldValues: existing,
    metadata: {
      requestId: requestId ?? null,
      threadId,
      removalType: isAuthorDelete ? 'author_self_delete' : 'moderator_removal',
      moderationReason: canModerateReplies ? moderationReason ?? null : null,
    },
  });
}

export async function updateForumThreadForCommunity(
  communityId: number,
  threadId: number,
  actorUserId: string,
  input: UpdateForumThreadInput,
  requestId?: string | null,
): Promise<ForumThreadRecord> {
  const scoped = createScopedClient(communityId);
  const existingRows = await scoped.selectFrom<ForumThreadRecord>(forumThreads, {}, eq(forumThreads.id, threadId));
  const existing = existingRows[0];

  if (!existing) {
    throw new NotFoundError('Forum thread not found');
  }

  const [updated] = await scoped.update(
    forumThreads,
    {
      ...(input.title !== undefined ? { title: input.title.trim() } : {}),
      ...(input.body !== undefined ? { body: input.body.trim() } : {}),
      ...(input.isPinned !== undefined ? { isPinned: input.isPinned } : {}),
      ...(input.isLocked !== undefined ? { isLocked: input.isLocked } : {}),
    },
    eq(forumThreads.id, threadId),
  );

  if (!updated) {
    throw new NotFoundError('Forum thread not found');
  }

  const row = mapForumThreadRow(updated as unknown as ForumThreadRecord);
  await logAuditEvent({
    userId: actorUserId,
    action: 'update',
    resourceType: 'forum_thread',
    resourceId: String(threadId),
    communityId,
    oldValues: existing,
    newValues: row,
    metadata: { requestId: requestId ?? null },
  });

  return row;
}

export async function deleteForumThreadForCommunity(
  communityId: number,
  threadId: number,
  actorUserId: string,
  requestId?: string | null,
): Promise<void> {
  const scoped = createScopedClient(communityId);
  const existingRows = await scoped.selectFrom<ForumThreadRecord>(forumThreads, {}, eq(forumThreads.id, threadId));
  const existing = existingRows[0];

  if (!existing) {
    throw new NotFoundError('Forum thread not found');
  }

  await scoped.softDelete(forumThreads, eq(forumThreads.id, threadId));
  await scoped.softDelete(forumReplies, eq(forumReplies.threadId, threadId));

  await logAuditEvent({
    userId: actorUserId,
    action: 'delete',
    resourceType: 'forum_thread',
    resourceId: String(threadId),
    communityId,
    oldValues: existing,
    metadata: { requestId: requestId ?? null },
  });
}

// ---------------------------------------------------------------------------
// Polls list helpers (used by /api/v1/polls GET)
// ---------------------------------------------------------------------------

export interface PaginatedPolls {
  data: PollRecord[];
  pagination: {
    nextCursor: string | null;
    hasMore: boolean;
    pageSize: number;
  };
}

/**
 * Cursor-paginated list of polls in a community. Filter pushdown:
 * - `isActive` (default `true`) → `eq(polls.isActive, isActive)`
 * - `includeEnded=false` (default) → `or(isNull(polls.endsAt), gt(polls.endsAt, now))`
 *   to drop polls whose deadline has elapsed.
 *
 * Time cutoff is captured by the caller and passed in as `now` so the
 * route can fix it once per request (consistent across same-request
 * usage). Helper applies the cutoff verbatim.
 *
 * AUTHZ: tenant-scoped — caller MUST have already verified the actor's
 * community membership and `requirePollReadPermission`/
 * `requirePollsEnabled` gates.
 */
export async function paginatePollsForCommunity(params: {
  communityId: number;
  cursor?: string;
  pageSize?: number;
  isActive?: boolean;
  includeEnded?: boolean;
  /** Cutoff for the includeEnded filter; required when includeEnded === false. */
  now?: Date;
}): Promise<PaginatedPolls> {
  const isActive = params.isActive ?? true;
  const includeEnded = params.includeEnded ?? false;

  const filterClauses = [eq(polls.isActive, isActive)];
  if (!includeEnded) {
    const now = params.now ?? new Date();
    filterClauses.push(or(isNull(polls.endsAt), gt(polls.endsAt, now))!);
  }
  const where = filterClauses.length === 1 ? filterClauses[0] : and(...filterClauses);

  const scoped = createScopedClient(params.communityId);
  const result = await paginate<PollRecord>(
    scoped,
    polls,
    { cursor: params.cursor, pageSize: params.pageSize },
    { where },
  );
  return {
    data: result.data.map(mapPollRow),
    pagination: result.pagination,
  };
}
