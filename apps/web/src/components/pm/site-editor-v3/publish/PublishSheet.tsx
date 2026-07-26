'use client';

/**
 * The review-and-publish sheet (Phase 5).
 *
 * ## It is atomic, and that is a decision, not an omission
 *
 * There are no tick boxes here, no "select all", no per-change staging and no
 * dependency gating. Selective publish was cut permanently: the data model has
 * no stable section identity (every write soft-deletes and re-inserts, so row
 * ids churn and draft/published rows correlate only by slot), which means a
 * "publish only these three" selection cannot be expressed against the rows the
 * server would have to promote. A UI that offered the choice would be offering
 * a guess. The sheet therefore reviews the whole draft and promotes the whole
 * draft — which is also exactly what `POST /api/v1/pm/site/publish` does.
 *
 * ## Blocking names the offender
 *
 * `publishBlocked` is a boolean, but a disabled button next to "fix errors
 * first" is a dead end — the PM has no idea which of eleven sections is wrong.
 * Every blocking issue is listed with the section it belongs to, and each one
 * offers "Fix this", which closes the sheet and hands the slot back to the
 * editor via `onFixIssue`. The sheet does not import the editor context: it is
 * code-split and mounted on demand, and reaching into a provider it may not be
 * rendered under is how a review surface becomes untestable.
 *
 * ## Zero changes is impossible, not a no-op
 *
 * The server can answer `{ published: false, reason: 'nothing-to-publish' }`,
 * but firing a request that we can already prove is pointless teaches the PM
 * that Publish sometimes does nothing for no visible reason. When the diff is
 * empty the action is disabled and says so.
 *
 * ## Failure gets a receipt, not a toast
 *
 * See `Receipt.tsx`. Success closes the sheet and toasts through the root
 * layout's single `<Toaster/>` — no second Toaster is mounted here.
 */

import { useMemo, useState } from 'react';
import { toast } from 'sonner';
import { AlertTriangle, ArrowRight, Info } from 'lucide-react';
import {
  contrastIssues,
  diffSite,
  publishBlocked,
  siteIssues,
  type Change,
  type Issue,
  type ResolvedBrandColors,
  type SiteSnapshot,
} from '@propertypro/shared';
import { Button } from '@/components/ui/button';
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet';
import { Skeleton } from '@/components/ui/skeleton';
import { AlertBanner } from '@/components/shared/alert-banner';
import { useContentBlocks, usePublishedBlocks, useSitePublishToken } from '@/hooks/use-content-blocks';
import {
  usePublishSite,
  PublishConflictError,
  type PublishSiteResult,
} from '@/hooks/use-publish-site';
import { issueTarget, toSnapshot } from '@/lib/site-editor/to-snapshot';
import { cn } from '@/lib/utils';
import { Receipt, type ReceiptStatus } from './Receipt';

export interface PublishSheetProps {
  /** Controlled — the editor's top bar owns the open state. */
  open: boolean;
  onOpenChange: (open: boolean) => void;
  communityId: number;
  /**
   * Already-resolved brand colours (`resolveTheme` output), when the editor
   * has them. Passed in rather than resolved here so this tree keeps no
   * dependency on `packages/theme`; omit and the contrast advisories are simply
   * not shown. Never blocking — see the long note on `contrastIssues`.
   */
  brandColors?: ResolvedBrandColors;
  /**
   * Jump to the section a blocking issue is about. The sheet closes first, then
   * calls this with the section's `block_order` slot; the editor owns selection.
   */
  onFixIssue?: (slot: number) => void;
}

/** `'site'` sorts first; any Phase 11 page group follows, alphabetically. */
const SITE_GROUP = 'site';

const KIND_LABEL: Record<Change['kind'], string> = {
  added: 'Added',
  edited: 'Edited',
  removed: 'Removed',
  reordered: 'Reordered',
};

const GROUP_LABEL: Record<string, string> = {
  [SITE_GROUP]: 'Across the site',
};

function groupLabel(group: string): string {
  return GROUP_LABEL[group] ?? group;
}

function plural(n: number, noun: string): string {
  return `${n} ${noun}${n === 1 ? '' : 's'}`;
}

/**
 * Groups changes by `change.group`, site-wide first.
 *
 * Insertion order within a group is preserved: `diffSite` emits in a stable
 * order and re-sorting would only make two consecutive reviews of the same
 * draft disagree about where a row sits.
 */
export function groupChanges(changes: readonly Change[]): Array<{ group: string; changes: Change[] }> {
  const byGroup = new Map<string, Change[]>();
  for (const change of changes) {
    const bucket = byGroup.get(change.group);
    if (bucket) bucket.push(change);
    else byGroup.set(change.group, [change]);
  }
  return [...byGroup.entries()]
    .sort(([a], [b]) => {
      if (a === b) return 0;
      if (a === SITE_GROUP) return -1;
      if (b === SITE_GROUP) return 1;
      return a.localeCompare(b);
    })
    .map(([group, groupedChanges]) => ({ group, changes: groupedChanges }));
}

/** What the publish outcome should say. Mirrors the legacy PublishBar's wording. */
function describeOutcome(result: PublishSiteResult): string {
  if (!result.published) return 'The server found nothing left to publish.';
  const { promotedCount, retiredCount } = result;
  if (promotedCount > 0 && retiredCount > 0) {
    return `Published — ${plural(promotedCount, 'section')} live, ${plural(retiredCount, 'section')} removed.`;
  }
  if (promotedCount === 0 && retiredCount > 0) {
    return `Published — ${plural(retiredCount, 'section')} removed.`;
  }
  return `Published — ${plural(promotedCount, 'section')} live.`;
}

interface ReceiptState {
  status: ReceiptStatus;
  attempted: string;
  outcome: string;
  nextStep: string;
}

export function PublishSheet({
  open,
  onOpenChange,
  communityId,
  brandColors,
  onFixIssue,
}: PublishSheetProps) {
  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
        side="right"
        className="flex w-full flex-col gap-4 overflow-y-auto sm:max-w-lg"
      >
        <SheetHeader>
          <SheetTitle>Review and publish</SheetTitle>
          <SheetDescription>
            Everything below goes live together. Publishing is all-or-nothing —
            there is no way to ship part of a draft.
          </SheetDescription>
        </SheetHeader>
        {/* Mounted only while open so the blocks query fires on demand rather
            than for every PM who never reviews. */}
        {open ? (
          <PublishSheetBody
            communityId={communityId}
            brandColors={brandColors}
            onFixIssue={onFixIssue}
            onOpenChange={onOpenChange}
          />
        ) : null}
      </SheetContent>
    </Sheet>
  );
}

interface BodyProps {
  communityId: number;
  brandColors?: ResolvedBrandColors;
  onFixIssue?: (slot: number) => void;
  onOpenChange: (open: boolean) => void;
}

function PublishSheetBody({ communityId, brandColors, onFixIssue, onOpenChange }: BodyProps) {
  const draftQuery = useContentBlocks(communityId);
  const publishedQuery = usePublishedBlocks(communityId);
  // The authoritative token: max(published_at) over ALL published rows,
  // including rows shadowed by a draft. Deriving it from the merged list would
  // drop exactly those rows and 409 against a publish nobody else made.
  const tokenQuery = useSitePublishToken(communityId);
  const publish = usePublishSite(communityId);

  const [receipt, setReceipt] = useState<ReceiptState | null>(null);

  const next: SiteSnapshot = useMemo(() => toSnapshot(draftQuery.data), [draftQuery.data]);

  const published: SiteSnapshot | null = useMemo(() => {
    const rows = publishedQuery.data;
    if (!rows || rows.length === 0) return null;
    return toSnapshot(rows);
  }, [publishedQuery.data]);

  const diff = useMemo(() => diffSite(published, next), [published, next]);

  const issues: Issue[] = useMemo(() => {
    const structural = siteIssues(next);
    // Advisory at publish on purpose: branding is unstaged and already live on
    // the public site, so blocking here cannot un-ship a bad ratio — it would
    // only stop an unrelated copy fix. See the note on `contrastIssues`.
    const contrast = brandColors ? contrastIssues(brandColors, { severity: 'warning' }) : [];
    return [...structural, ...contrast];
  }, [next, brandColors]);

  const blocking = useMemo(() => issues.filter((i) => i.severity === 'error'), [issues]);
  const warnings = useMemo(() => issues.filter((i) => i.severity === 'warning'), [issues]);
  const blocked = publishBlocked(issues);

  const isPending = draftQuery.isPending || publishedQuery.isPending || tokenQuery.isPending;
  const isError = draftQuery.isError || publishedQuery.isError;
  const hasChanges = diff.changes.length > 0;

  function fixIssue(slot: number) {
    onOpenChange(false);
    onFixIssue?.(slot);
  }

  async function onPublish() {
    setReceipt(null);
    const attempted = `You published ${plural(diff.changes.length, 'change')}.`;
    try {
      const result = await publish.mutateAsync({
        expectedPublishedAt: tokenQuery.data ?? null,
      });
      if (!result.published) {
        setReceipt({
          status: 'nothing',
          attempted,
          outcome: describeOutcome(result),
          nextStep:
            'Your live site is unchanged. Close this and reload the editor — someone may have already published these changes.',
        });
        return;
      }
      toast.success(describeOutcome(result));
      onOpenChange(false);
    } catch (error) {
      if (error instanceof PublishConflictError) {
        setReceipt({
          status: 'conflict',
          attempted,
          outcome: 'Someone else published while you were working, so nothing was published.',
          nextStep:
            'Reload the editor to pick up their changes, check yours still make sense, then publish again.',
        });
        return;
      }
      setReceipt({
        status: 'error',
        attempted,
        outcome: error instanceof Error ? error.message : 'The publish request failed.',
        nextStep: 'Your live site is unchanged and your draft is safe. Try publishing again.',
      });
    }
  }

  if (isPending) {
    return (
      <div className="space-y-3" aria-busy="true">
        <span className="sr-only">Loading your changes</span>
        <Skeleton className="h-6 w-48" />
        <Skeleton className="h-20 w-full" />
        <Skeleton className="h-20 w-full" />
      </div>
    );
  }

  if (isError) {
    const message =
      draftQuery.error?.message ?? publishedQuery.error?.message ?? 'Please try again.';
    return (
      <AlertBanner
        status="danger"
        title="We couldn't work out what's changed"
        description={message}
        action={
          <Button
            variant="outline"
            size="sm"
            onClick={() => {
              void draftQuery.refetch();
              void publishedQuery.refetch();
            }}
          >
            Try again
          </Button>
        }
      />
    );
  }

  const grouped = groupChanges(diff.changes);

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-5">
      {receipt ? (
        <Receipt
          status={receipt.status}
          attempted={receipt.attempted}
          outcome={receipt.outcome}
          nextStep={receipt.nextStep}
          onDismiss={() => setReceipt(null)}
        />
      ) : null}

      {blocking.length > 0 ? (
        <BlockingIssues
          issues={blocking}
          snapshot={next}
          onFix={fixIssue}
          canFix={onFixIssue !== undefined}
        />
      ) : null}

      <section aria-labelledby="publish-changes-heading" className="space-y-4">
        <h3 id="publish-changes-heading" className="text-sm font-semibold text-content">
          {hasChanges
            ? `${plural(diff.changes.length, 'change')} ready to publish`
            : 'Nothing to publish'}
        </h3>

        {diff.firstPublish && hasChanges ? (
          <p className="text-sm text-content-secondary">
            This is your site&apos;s first publish, so everything on it is new.
          </p>
        ) : null}

        {hasChanges ? (
          grouped.map(({ group, changes }) => (
            <div key={group} data-testid={`change-group-${group}`} className="space-y-2">
              <h4 className="text-xs font-semibold uppercase tracking-wide text-content-secondary">
                {groupLabel(group)}
              </h4>
              <ul className="space-y-2">
                {changes.map((change) => (
                  <ChangeRow key={`${change.key}-${change.kind}`} change={change} />
                ))}
              </ul>
            </div>
          ))
        ) : (
          <p className="rounded-md border border-edge bg-surface-muted p-4 text-sm text-content-secondary">
            Your draft matches what&apos;s already live, so there&apos;s nothing to
            publish. Edit a section and it will show up here.
          </p>
        )}
      </section>

      {warnings.length > 0 ? <WarningList issues={warnings} /> : null}

      <div className="mt-auto flex flex-col gap-2 border-t border-edge pt-4">
        <Button
          type="button"
          onClick={() => void onPublish()}
          disabled={blocked || !hasChanges || publish.isPending}
          loading={publish.isPending}
        >
          {publish.isPending ? 'Publishing…' : 'Publish changes'}
        </Button>
        <p className="text-xs text-content-secondary" data-testid="publish-hint">
          {blocked
            ? 'Fix the problems above before publishing.'
            : !hasChanges
              ? "There's nothing to publish yet."
              : 'All of these changes go live at once.'}
        </p>
      </div>
    </div>
  );
}

function ChangeRow({ change }: { change: Change }) {
  return (
    <li className="rounded-md border border-edge bg-surface-card p-3">
      <div className="flex flex-wrap items-baseline gap-x-2 gap-y-1">
        <span className="text-xs font-semibold uppercase tracking-wide text-content-secondary">
          {KIND_LABEL[change.kind]}
        </span>
        <span className="text-sm font-medium text-content">{change.title}</span>
        {change.alsoMoved ? (
          <span className="text-xs text-content-secondary">and moved</span>
        ) : null}
      </div>
      {change.degraded ? (
        <p className="mt-1 flex items-start gap-1.5 text-xs text-content-secondary">
          <Info className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden="true" />
          <span>
            We couldn&apos;t read this section&apos;s saved settings, so it may be listed
            as changed even if you didn&apos;t touch it.
          </span>
        </p>
      ) : null}
    </li>
  );
}

interface BlockingIssuesProps {
  issues: readonly Issue[];
  snapshot: SiteSnapshot;
  onFix: (slot: number) => void;
  canFix: boolean;
}

function BlockingIssues({ issues, snapshot, onFix, canFix }: BlockingIssuesProps) {
  return (
    <section
      role="alert"
      aria-labelledby="publish-blocking-heading"
      className={cn(
        'space-y-3 rounded-md border border-status-danger-border bg-status-danger-bg p-4',
      )}
    >
      <h3
        id="publish-blocking-heading"
        className="flex items-center gap-2 text-sm font-semibold text-content"
      >
        <AlertTriangle className="h-4 w-4 text-status-danger" aria-hidden="true" />
        {issues.length === 1
          ? 'One problem is stopping this publish'
          : `${issues.length} problems are stopping this publish`}
      </h3>
      <ul className="space-y-3">
        {issues.map((issue, index) => {
          const target = issueTarget(issue.field, snapshot);
          const name = describeTarget(issue, snapshot);
          return (
            <li key={`${issue.field}-${index}`} className="space-y-1 text-sm">
              <p className="font-medium text-content">{name}</p>
              <p className="text-content-secondary">{issue.message}</p>
              {canFix && target ? (
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => onFix(target.slot)}
                >
                  Fix this
                  <ArrowRight className="h-4 w-4" aria-hidden="true" />
                </Button>
              ) : null}
            </li>
          );
        })}
      </ul>
    </section>
  );
}

/**
 * A human name for whatever an issue is about.
 *
 * Names the offender rather than the field path: "Section 4 (FAQ)" is
 * actionable, `sections.2.content.items.0.question` is not. Falls back to the
 * raw field only for issues that are not about a section at all.
 */
function describeTarget(issue: Issue, snapshot: SiteSnapshot): string {
  if (issue.field === 'hero' || issue.field.startsWith('hero.')) {
    return 'Welcome section';
  }
  const target = issueTarget(issue.field, snapshot);
  if (target) {
    return `Section ${target.slot} (${target.blockType})`;
  }
  return issue.field;
}

function WarningList({ issues }: { issues: readonly Issue[] }) {
  return (
    <section aria-labelledby="publish-warnings-heading" className="space-y-2">
      <h3
        id="publish-warnings-heading"
        className="flex items-center gap-2 text-sm font-semibold text-content"
      >
        <Info className="h-4 w-4 text-status-warning" aria-hidden="true" />
        {issues.length === 1
          ? "One thing worth a look — it won't stop you publishing"
          : `${issues.length} things worth a look — they won't stop you publishing`}
      </h3>
      <ul className="space-y-1 text-sm text-content-secondary">
        {issues.map((issue, index) => (
          <li key={`${issue.field}-${index}`}>{issue.message}</li>
        ))}
      </ul>
    </section>
  );
}
