/**
 * ActivityLogList — the operator trail, rendered as a dense log.
 *
 * ## Zero client JavaScript, deliberately
 *
 * Every affordance here is a native element: `<details>`/`<summary>` for the
 * row expansion (keyboard support, `aria-expanded` semantics and the disclosure
 * role all come free) and `<Link>` for every filter. Nothing is a state hook,
 * so there is nothing to hydrate.
 *
 * That is not minimalism for its own sake. This is a surface an operator opens
 * during an incident, and this repo has shipped controls that rendered
 * correctly and did nothing because React had not attached a handler yet — the
 * reason `apps/web/e2e/helpers/hydration.ts` exists, and the reason
 * `HealthFreshness`'s docblock refuses to be passed across a server-component
 * prop boundary. A log viewer that needs hydration to filter is a log viewer
 * that can fail in exactly the minutes it is needed.
 *
 * ## Timestamps are UTC, and say so
 *
 * A Server Component formats in the SERVER's zone, which on Vercel is UTC.
 * Rendering that as if it were the operator's local time would be a silent lie;
 * formatting client-side would reintroduce hydration. UTC is also the right
 * answer on the merits — Sentry, Stripe and Vercel's own logs are what an
 * operator is correlating against, and they are all UTC. The column is labelled
 * and each cell carries a machine-readable `<time dateTime>`.
 *
 * ## Why the action pill is not itself a filter link
 *
 * An anchor inside `<summary>` toggles the disclosure as well as navigating,
 * and suppressing that needs an `onClick` — which would make this a client
 * component for one interaction. The filter links live in the expanded body
 * instead, where they cost nothing.
 *
 * ## An unrecognised action must still be visible
 *
 * `ACTION_TONE` is a partial map over `AdminAuditAction`, and the fallback is
 * neutral-but-painted, never absent. Production already holds `data_repair` and
 * `auth_user_deleted`, neither of which is in that union — the table takes
 * `text` and manual repairs write to it directly (see
 * `.claude/rules/migration-safety.md`). A tone map that rendered an unknown
 * action as nothing would hide precisely the rows nobody planned for.
 */
import Link from 'next/link';
import { ChevronRight, ScrollText } from 'lucide-react';
import { AlertBanner, Button, EmptyState } from '@propertypro/ui';
import type { AdminActivityEntry } from '@/lib/server/admin-activity';

interface ActivityLogListProps {
  entries: AdminActivityEntry[];
  /** Pass as `?before=` to reach the next page. `null` = last page. */
  nextCursor: number | null;
  /** The filters in force, so the "older" link and the chips can preserve them. */
  filters: { action?: string; admin?: string; communityId?: number };
  /** Base path the filter and paging links are built against. */
  basePath: string;
  /** Set when the read failed — renders a failure, never an empty state. */
  error?: string;
  /**
   * True when the URL carried a `before` cursor, i.e. this is not the first
   * page. Passed separately from `filters` because a cursor is NOT a filter:
   * conflating them makes an exhausted cursor say "nothing matches these
   * filters", which is its own untrue sentence.
   */
  hasCursor?: boolean;
  /**
   * Query params that were PRESENT but unparseable, so the page is showing more
   * than was asked for.
   *
   * `positiveInt` cannot distinguish "absent" from "invalid" on its own, and the
   * two must not look the same here: silently widening an audit view from one
   * community to the whole platform is the dangerous direction to fail in, and
   * nothing on screen said it had happened.
   */
  rejected?: string[];
}

/**
 * Tone per action. Written out per family rather than derived from a substring
 * so `guard:class-resolution`'s admin counterpart can see every class literally
 * — a template like `bg-status-${tone}-subtle` compiles to no CSS at all.
 */
type Tone = 'danger' | 'warning' | 'info' | 'neutral';

const TONE_CLASS: Record<Tone, string> = {
  danger: 'bg-status-danger-subtle text-status-danger',
  warning: 'bg-status-warning-subtle text-status-warning',
  info: 'bg-status-info-subtle text-status-info',
  neutral: 'bg-status-neutral-subtle text-status-neutral',
};

/**
 * Destructive and money-moving actions are tinted; everything else is neutral.
 *
 * The split is "would this have to be explained afterwards", not severity in
 * the abstract — the five subscription actions are here because, as
 * `log-admin-action.ts` puts it, they are the only entries that MOVE MONEY and
 * the trail is the only record linking a charge to the operator who caused it.
 */
const ACTION_TONE: Record<string, Tone> = {
  platform_admin_added: 'danger',
  platform_admin_removed: 'danger',
  demo_deleted: 'danger',
  support_thread_deleted: 'danger',
  auth_user_deleted: 'danger',
  data_repair: 'danger',
  member_removed: 'danger',
  subscription_plan_changed: 'warning',
  subscription_trial_extended: 'warning',
  subscription_coupon_applied: 'warning',
  subscription_paused: 'warning',
  subscription_resumed: 'warning',
  subscription_canceled: 'warning',
  access_plan_granted: 'warning',
  access_plan_revoked: 'warning',
  access_plan_extended: 'warning',
  deletion_request_intervened: 'warning',
  deletion_request_recovered: 'warning',
  cron_job_retried: 'info',
  member_role_changed: 'info',
};

export function actionTone(action: string): Tone {
  return ACTION_TONE[action] ?? 'neutral';
}

/**
 * `Sep 10 17:53:07.276` — the shape a log column wants.
 *
 * Built from the ISO string rather than `Intl.DateTimeFormat` so the output is
 * UTC by construction and cannot drift with the server's `TZ`. Milliseconds are
 * kept: two production rows differ only below the second, which is how the
 * duplicate-write they represent is visible at all.
 *
 * An unparseable value renders as itself rather than `Invalid Date` — a log
 * that cannot read its own row should show the raw value, not a word.
 */
export function formatLogTime(iso: string): string {
  const at = new Date(iso);
  if (!Number.isFinite(at.getTime())) return iso;
  const month = at.toLocaleString('en-US', { month: 'short', timeZone: 'UTC' });
  const day = String(at.getUTCDate()).padStart(2, '0');
  const hh = String(at.getUTCHours()).padStart(2, '0');
  const mm = String(at.getUTCMinutes()).padStart(2, '0');
  const ss = String(at.getUTCSeconds()).padStart(2, '0');
  const ms = String(at.getUTCMilliseconds()).padStart(3, '0');
  return `${month} ${day} ${hh}:${mm}:${ss}.${ms}`;
}

/**
 * Build a URL preserving the filters in force, overriding what is named.
 *
 * Exported because `page.tsx` builds the header's "Newest first" link with it.
 * That link used to point at the bare base path, which silently discarded every
 * filter in force — a destructive action behind a label that promises only a
 * change of position.
 */
export function buildHref(
  basePath: string,
  filters: ActivityLogListProps['filters'],
  overrides: { action?: string | null; admin?: string | null; communityId?: number | null; before?: number | null },
): string {
  const params = new URLSearchParams();
  const action = 'action' in overrides ? overrides.action : filters.action;
  const admin = 'admin' in overrides ? overrides.admin : filters.admin;
  const communityId =
    'communityId' in overrides ? overrides.communityId : filters.communityId;

  if (action) params.set('action', action);
  if (admin) params.set('admin', admin);
  if (communityId !== null && communityId !== undefined) {
    params.set('communityId', String(communityId));
  }
  // `before` is never inherited: changing a filter must restart paging, or the
  // cursor from the old result set silently hides the new one's first page.
  if (overrides.before) params.set('before', String(overrides.before));

  const query = params.toString();
  return query ? `${basePath}?${query}` : basePath;
}

/** A JSON payload block, or nothing when the column is null. */
function Payload({ label, value }: { label: string; value: Record<string, unknown> | null }) {
  if (!value) return null;
  return (
    <div className="min-w-[240px] flex-1">
      <p className="mb-1 text-xs font-semibold text-content-secondary">{label}</p>
      {/*
        `whitespace-pre-wrap break-words` so a long value WRAPS rather than
        sitting behind a horizontal scrollbar nobody notices — audit payloads
        carry prose reasons and UUIDs, and the first preview clipped
        "super_admin minted in production b…" mid-word with no visible cue.
        `overflow-x-auto` stays as the backstop for an unbreakable run.
      */}
      <pre className="overflow-x-auto whitespace-pre-wrap break-words rounded-md border border-edge-subtle bg-surface-sunken p-3 font-mono text-xs text-content-secondary">
        {JSON.stringify(value, null, 2)}
      </pre>
    </div>
  );
}

export function ActivityLogList({
  entries,
  nextCursor,
  filters,
  basePath,
  error,
  hasCursor = false,
  rejected = [],
}: ActivityLogListProps) {
  const hasFilters = Boolean(filters.action || filters.admin || filters.communityId !== undefined);
  /** Back to the newest page, KEEPING the filters. */
  const newestHref = buildHref(basePath, filters, { before: null });

  return (
    <div className="space-y-3">
      {rejected.length > 0 && (
        <AlertBanner
          status="warning"
          title={
            rejected.length === 1
              ? `Ignored an unusable ${rejected[0]} value`
              : `Ignored unusable values for ${rejected.join(', ')}`
          }
          description="The rest of the URL was applied, so this view is WIDER than the link asked for. Correct the value or clear the filter."
        />
      )}

      {/*
        The banner renders INSIDE the normal tree rather than as an early return.
        An early return dropped the filter chips and "Clear all" along with the
        list, so the only way out of a failed filtered read was to hand-edit the
        URL — and the page docblock claimed the opposite.
      */}
      {error && (
        <AlertBanner
          status="danger"
          title="We couldn't load the activity log"
          // Two blocks, not one interpolated string. The upstream message is not
          // guaranteed to end in punctuation, so concatenating ran it straight
          // into our sentence: "…(code 42501) The trail itself is unaffected".
          description={
            <>
              <span className="block font-mono">{error}</span>
              <span className="mt-1 block">
                The trail itself is unaffected — this is a read failure, not a gap in the
                record. Please try again.
              </span>
            </>
          }
        />
      )}

      {(hasFilters || hasCursor) && (
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-xs text-content-tertiary">
            {hasFilters ? 'Filtered by' : 'Showing'}
          </span>
          {filters.action && (
            <FilterChip
              label={`action: ${filters.action}`}
              clearHref={buildHref(basePath, filters, { action: null, before: null })}
            />
          )}
          {filters.admin && (
            <FilterChip
              label={`operator: ${filters.admin}`}
              clearHref={buildHref(basePath, filters, { admin: null, before: null })}
            />
          )}
          {filters.communityId !== undefined && (
            <FilterChip
              label={`community: ${filters.communityId}`}
              clearHref={buildHref(basePath, filters, { communityId: null, before: null })}
            />
          )}
          {/* A cursor is its own chip, cleared back to the newest page while the
              filters stay put. Without it, paging deep into a filtered log left
              no on-screen sign that this was not the top. */}
          {hasCursor && (
            <FilterChip label="older entries only" clearHref={newestHref} />
          )}
          <Link
            href={basePath}
            className="rounded-md px-2 py-1 text-xs font-medium text-content-link hover:text-content-link-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-edge-focus"
          >
            Clear all
          </Link>
        </div>
      )}

      {/*
        No empty state at all when the read failed — the banner above has already
        said what happened, and "no operator activity recorded yet" underneath it
        would contradict it in the same breath.

        Otherwise THREE states, not two. An exhausted cursor is neither "the log
        is empty" nor "nothing matches these filters": `?before=<id past the end>`
        returns zero rows on a perfectly healthy log, and it is reachable from the
        pasteable URLs this page advertises. Reporting that as an empty log is the
        exact lie `admin-activity.ts` throws rather than tell.
      */}
      {error ? null : entries.length === 0 ? (
        hasCursor ? (
          <EmptyState
            icon={ScrollText}
            title="You've reached the end of the log"
            description="There is nothing older than this point. The entries above this page are still there."
            action={
              <Button asChild size="sm" variant="outline">
                <Link href={newestHref}>Back to the newest entries</Link>
              </Button>
            }
          />
        ) : (
          <EmptyState
            icon={ScrollText}
            title={hasFilters ? 'Nothing matches these filters' : 'No operator activity recorded yet'}
            description={
              hasFilters
                ? 'Clear a filter to widen the search. The trail is append-only, so nothing here has been removed.'
                : 'Privileged actions taken in this console — admin grants, subscription changes, cron retries, deletions — are recorded here as they happen.'
            }
          />
        )
      ) : (
        <>
          {/* A real list of disclosures. The header row is presentational and is
              hidden from assistive tech, which reads each row's own summary. */}
          <div className="overflow-hidden rounded-lg border border-edge bg-surface-card shadow-e1">
            <div
              aria-hidden="true"
              className="hidden items-center gap-3 border-b border-edge bg-surface-subtle py-2 pl-11 pr-4 font-mono text-xs text-content-tertiary sm:flex"
            >
              <span className="w-[170px] shrink-0">TIME (UTC)</span>
              <span className="w-[265px] shrink-0">ACTION</span>
              <span className="min-w-0 flex-1">RESOURCE</span>
              <span className="w-[200px] shrink-0">OPERATOR</span>
            </div>

            <ul className="divide-y divide-edge">
              {entries.map((entry) => (
                <li key={entry.id}>
                  <details className="group">
                    <summary className="flex min-h-11 cursor-pointer list-none items-start gap-3 px-4 py-2 hover:bg-surface-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-edge-focus [&::-webkit-details-marker]:hidden sm:min-h-9">
                      <ChevronRight
                        size={14}
                        aria-hidden="true"
                        className="mt-1 shrink-0 text-content-tertiary transition-transform group-open:rotate-90"
                      />
                      {/*
                        Two type sizes on one row, deliberately. The action and
                        the resource are the row's PRIMARY content and sit at
                        `text-sm`, matching `ErrorsList`'s issue title and
                        `FailedJobsList`'s job name; the timestamp and the
                        operator are metadata and stay at `text-xs`. DESIGN.md is
                        explicit that `xs` is "metadata-only, never primary
                        content", and the first pass had every column at `xs`.
                        No guard checks font size, so this is review-enforced.

                        It is also the hierarchy a log viewer wants — a dim, small
                        timestamp beside a prominent message.

                        Stacks below `sm`, becomes the log ROW above it. The
                        column widths are `sm:`-only on purpose: as unconditional
                        `w-[…]` they could not shrink, so at phone width the row
                        overflowed, pushed the resource off-screen and left each
                        row several hundred pixels tall. Nothing about the
                        desktop rendering revealed that.
                      */}
                      <div className="flex min-w-0 flex-1 flex-col gap-1 sm:flex-row sm:items-start sm:gap-3">
                        <time
                          dateTime={entry.createdAt}
                          className="shrink-0 font-mono text-xs tabular-nums text-content-tertiary sm:w-[170px]"
                        >
                          {formatLogTime(entry.createdAt)}
                        </time>
                        <span
                          // The full value on hover, because the longest real
                          // actions (`subscription_trial_extended`,
                          // `deletion_request_intervened`) still reach the
                          // column's edge. The expanded body always shows it in
                          // full as well.
                          title={entry.action}
                          className={`w-fit max-w-full shrink-0 truncate rounded px-1.5 py-0.5 font-mono text-sm font-medium sm:w-[265px] ${TONE_CLASS[actionTone(entry.action)]}`}
                        >
                          {entry.action}
                        </span>
                        <span className="min-w-0 flex-1 break-words font-mono text-sm text-content">
                          {entry.resourceType}
                          {entry.resourceId && (
                            <span className="text-content-tertiary"> #{entry.resourceId}</span>
                          )}
                        </span>
                        <span className="shrink-0 truncate font-mono text-xs text-content-secondary sm:w-[200px]">
                          {entry.adminEmail ?? '—'}
                        </span>
                      </div>
                    </summary>

                    <div className="space-y-4 border-t border-edge-subtle bg-surface-subtle px-4 py-4 sm:pl-11">
                      <dl className="grid gap-x-6 gap-y-2 sm:grid-cols-2">
                        <Field label="Recorded" value={`${entry.createdAt} (entry #${entry.id})`} />
                        <Field label="Operator" value={entry.adminEmail ?? entry.adminUserId} />
                        <Field
                          label="Resource"
                          value={`${entry.resourceType}${entry.resourceId ? ` #${entry.resourceId}` : ''}`}
                        />
                        <Field
                          label="Community"
                          value={
                            entry.communityId === null
                              ? 'None — a platform-level action'
                              : `#${entry.communityId}`
                          }
                        />
                      </dl>

                      {/* `flex-wrap`, not a fixed column count: a row with only
                          `metadata` would otherwise render into column one and
                          leave two empty cells. */}
                      {(entry.oldValues || entry.newValues || entry.metadata) && (
                        <div className="flex flex-wrap gap-3">
                          <Payload label="Before" value={entry.oldValues} />
                          <Payload label="After" value={entry.newValues} />
                          <Payload label="Metadata" value={entry.metadata} />
                        </div>
                      )}

                      <div className="flex flex-wrap gap-2 text-xs">
                        <FilterLink
                          href={buildHref(basePath, filters, {
                            action: entry.action,
                            before: null,
                          })}
                          label={`Only ${entry.action}`}
                        />
                        {entry.adminEmail && (
                          <FilterLink
                            href={buildHref(basePath, filters, {
                              admin: entry.adminEmail,
                              before: null,
                            })}
                            label={`Only ${entry.adminEmail}`}
                          />
                        )}
                        {entry.communityId !== null && (
                          <>
                            <FilterLink
                              href={buildHref(basePath, filters, {
                                communityId: entry.communityId,
                                before: null,
                              })}
                              label={`Only community #${entry.communityId}`}
                            />
                            <FilterLink
                              href={`/clients/${entry.communityId}`}
                              label="Open workspace"
                            />
                          </>
                        )}
                      </div>
                    </div>
                  </details>
                </li>
              ))}
            </ul>
          </div>

          {nextCursor !== null && (
            <div className="flex justify-center">
              <Link
                href={buildHref(basePath, filters, { before: nextCursor })}
                className="rounded-md border border-edge bg-surface-card px-3 py-2 text-sm font-medium text-content hover:bg-surface-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-edge-focus"
              >
                Load older entries
              </Link>
            </div>
          )}
        </>
      )}
    </div>
  );
}

function Field({ label, value }: { label: string; value: string }) {
  return (
    <div className="min-w-0">
      <dt className="text-xs font-semibold text-content-secondary">{label}</dt>
      <dd className="break-words font-mono text-xs text-content-tertiary">{value}</dd>
    </div>
  );
}

function FilterChip({ label, clearHref }: { label: string; clearHref: string }) {
  return (
    <Link
      href={clearHref}
      className="inline-flex items-center gap-1 rounded-md border border-edge bg-surface-muted px-2 py-1 font-mono text-xs text-content hover:bg-surface-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-edge-focus"
      aria-label={`Remove filter ${label}`}
    >
      {label}
      <span aria-hidden="true">×</span>
    </Link>
  );
}

function FilterLink({ href, label }: { href: string; label: string }) {
  return (
    <Link
      href={href}
      className="rounded-md border border-edge bg-surface-card px-2 py-1 font-mono text-content-link hover:bg-surface-hover hover:text-content-link-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-edge-focus"
    >
      {label}
    </Link>
  );
}
